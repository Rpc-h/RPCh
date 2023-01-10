import type * as RPChCryptoNode from "@rpch/crypto-bridge/nodejs";
import type * as RPChCryptoWeb from "@rpch/crypto-bridge/web";
import {
  Cache as SegmentCache,
  Message,
  Request,
  Response,
  Segment,
  hoprd,
} from "@rpch/common";
import { utils as etherUtils } from "ethers";
import fetch from "cross-fetch";
import ReliabilityScore from "./reliability-score";
import RequestCache from "./request-cache";
import { createLogger } from "./utils";

const log = createLogger();

/**
 * HOPR SDK options.
 */
export type HoprSdkOps = {
  timeout: number;
  discoveryPlatformApiEndpoint: string;
  reliabilityScoreFreshNodeThreshold?: number;
  reliabilityScoreMaxResponses?: number;
};

/**
 * Entry Node details
 */
export type EntryNode = {
  apiEndpoint: string;
  apiToken: string;
  peerId: string;
};

/**
 * Exit Node details
 */
export type ExitNode = {
  peerId: string;
  pubKey: string;
};

/**
 * Send traffic through the RPCh network
 */
export default class SDK {
  private crypto?: typeof RPChCryptoNode | typeof RPChCryptoWeb;
  // single inverval for the SDK for things that need to be checked.
  private interval?: NodeJS.Timer;
  private segmentCache: SegmentCache;
  private requestCache: RequestCache;
  private reliabilityScore: ReliabilityScore;
  // selected entry node
  private entryNode?: EntryNode;
  // available exit nodes
  private exitNodes: ExitNode[] = [];
  private exitNode?: ExitNode;
  // stopMessageListener
  private stopMessageListener?: () => void;

  constructor(
    private readonly ops: HoprSdkOps,
    private setKeyVal: (key: string, val: string) => Promise<any>,
    private getKeyVal: (key: string) => Promise<string | undefined>
  ) {
    this.segmentCache = new SegmentCache((message) => this.onMessage(message));
    this.requestCache = new RequestCache((request) =>
      this.onRequestRemoval(request)
    );
    this.reliabilityScore = new ReliabilityScore(
      ops.reliabilityScoreFreshNodeThreshold || 20,
      ops.reliabilityScoreMaxResponses || 100
    );
  }

  /**
   * @return true if SDK is ready to send requests
   */
  public get isReady(): boolean {
    return !!this.entryNode && this.exitNodes.length > 0 && !!this.exitNode;
  }

  /**
   * Requests the Discovery Platform for an Entry Node.
   * @param discoveryPlatformApiEndpoint
   * @return entry node details
   */
  private async selectEntryNode(discoveryPlatformApiEndpoint: string): Promise<{
    apiEndpoint: string;
    apiToken: string;
    peerId: string;
  }> {
    log.verbose("Selecting entry node");
    const response: {
      hoprd_api_endpoint: string;
      hoprd_api_port: string;
      accessToken: string;
      id: string;
    } = await fetch(
      new URL(
        "/api/request/entry-node",
        discoveryPlatformApiEndpoint
      ).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Content": "application/json",
        },
        body: JSON.stringify({
          client: "BW",
        }),
      }
    ).then((res) => res.json());

    const apiEndpointUrl = new URL(response.hoprd_api_endpoint);
    apiEndpointUrl.port = response.hoprd_api_port;

    this.entryNode = {
      apiEndpoint: apiEndpointUrl.toString(),
      apiToken: response.accessToken,
      peerId: response.id,
    };
    log.verbose("Selected entry node", this.entryNode);
    return this.entryNode;
  }

  /**
   * Updates exit node list from the Discovery Platform
   * @param discoveryPlatformApiEndpoint
   * @returns list of exit nodes
   */
  private async selectExitNode(
    discoveryPlatformApiEndpoint: string
  ): Promise<ExitNode[]> {
    log.verbose("Selecting exit node");
    const response: {
      exit_node_pub_key: string;
      id: string;
    }[] = await fetch(
      new URL(
        "/api/node?hasExitNode=true",
        discoveryPlatformApiEndpoint
      ).toString()
    ).then((res) => res.json());

    this.exitNodes = response.map((item) => ({
      peerId: item.id,
      pubKey: item.exit_node_pub_key,
    }));

    if (this.exitNodes.length === 0) throw Error("No exit nodes available");

    this.exitNode =
      this.exitNodes[Math.floor(Math.random() * this.exitNodes.length)];
    log.verbose("Selected exit node", this.exitNode);
    return this.exitNodes;
  }

  /**
   * Resolve request promise and delete the request from map
   * @param message Message received from cache module
   */
  private async onMessage(message: Message): Promise<void> {
    // check whether we have a matching request id
    const match = this.requestCache.getRequest(message.id);
    if (!match) {
      log.error(
        "matching request not found",
        message.id,
        log.createMetric({ id: message.id })
      );
      return;
    }

    const counter = await this.getKeyVal(
      match.request.exitNodeDestination
    ).then((k) => BigInt(k || "0"));

    // construct Response from Message
    const response = Response.fromMessage(
      this.crypto!,
      match.request,
      message,
      counter,
      (exitNodeId, counter) => {
        this.setKeyVal(exitNodeId, counter.toString());
      }
    );

    const responseTime = Date.now() - match.createdAt.getTime();
    log.verbose(
      "response time for request %s: %s ms",
      match.request.id,
      responseTime,
      log.createMetric({
        id: match.request.id,
        responseTime: responseTime,
      })
    );

    match.resolve(response);
    this.reliabilityScore.addMetric(
      match.request.entryNodeDestination,
      match.request.id,
      "success"
    );
    this.requestCache.removeRequest(match.request);

    log.verbose("responded to %s with %s", match.request.body, response.body);
  }

  /**
   * Adds a failed metric to the reliability score
   * when the request expires.
   * @param req Request received from cache module.
   */
  private onRequestRemoval(req: Request): void {
    this.reliabilityScore.addMetric(req.entryNodeDestination, req.id, "failed");
    log.normal("request %s expired", req.id);
  }

  /**
   * Start the SDK and initialize necessary data.
   */
  public async start(): Promise<void> {
    if (this.isReady) return;

    if (typeof window === "undefined") {
      log.verbose("Using 'node' RPCh crypto implementation");
      this.crypto =
        require("@rpch/crypto-bridge/nodejs") as typeof RPChCryptoNode;
    } else {
      log.verbose("Using 'web' RPCh crypto implementation");
      this.crypto = (await import(
        "@rpch/crypto-bridge/web"
      )) as typeof RPChCryptoWeb;
      // @ts-expect-error
      await this.crypto.init();
    }

    // check for expires caches every second
    this.interval = setInterval(() => {
      this.segmentCache.removeExpired(this.ops.timeout);
      this.requestCache.removeExpired(this.ops.timeout);
    }, 1e3);

    await this.selectEntryNode(this.ops.discoveryPlatformApiEndpoint);
    await this.selectExitNode(this.ops.discoveryPlatformApiEndpoint);
    this.stopMessageListener = await hoprd.createMessageListener(
      this.entryNode!.apiEndpoint,
      this.entryNode!.apiToken,
      (message) => {
        try {
          const segment = Segment.fromString(message);
          this.segmentCache.onSegment(segment);
        } catch (e) {
          log.verbose(
            "rejected received data from HOPRd: not a valid segment",
            message
          );
        }
      }
    );
  }

  /**
   * Stop the SDK and clear up tangling processes.
   */
  public async stop(): Promise<void> {
    if (this.stopMessageListener) this.stopMessageListener();
    clearInterval(this.interval);
  }

  /**
   * Creates a Request instance that can be sent through the RPCh network
   * @param origin
   * @param provider
   * @param body
   * @returns Request
   */
  public createRequest(provider: string, body: string): Request {
    if (!this.isReady) throw Error("SDK not ready to create requests");
    return Request.createRequest(
      this.crypto!,
      provider,
      body,
      this.entryNode!.peerId,
      this.exitNode!.peerId,
      this.crypto!.Identity.load_identity(
        etherUtils.arrayify(this.exitNode!.pubKey)
      )
    );
  }

  /**
   * Sends a Request through the RPCh network
   * @param req Request
   * @returns Promise<Response>
   */
  public sendRequest(req: Request): Promise<Response> {
    if (!this.isReady) throw Error("SDK not ready to send requests");

    return new Promise((resolve, reject) => {
      const message = req.toMessage();
      const segments = message.toSegments();
      this.requestCache.addRequest(req, resolve, reject);
      for (const segment of segments) {
        hoprd.sendMessage({
          apiEndpoint: this.entryNode!.apiEndpoint,
          apiToken: this.entryNode!.apiToken,
          message: segment.toString(),
          destination: this.exitNode!.peerId,
        });
      }
    });
  }
}
