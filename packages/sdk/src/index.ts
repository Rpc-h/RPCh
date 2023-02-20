// @ts-ignore
import * as RPChCryptoNoModules from "@rpch/crypto-bridge/build/no-modules";
import {
  Cache as SegmentCache,
  Message,
  Request,
  Response,
  Segment,
  hoprd,
  utils,
} from "@rpch/common";
import { utils as etherUtils } from "ethers";
import fetch from "cross-fetch";
import ReliabilityScore, { Stats } from "./reliability-score";
import RequestCache from "./request-cache";
import { createLogger } from "./utils";

const log = createLogger();
const DEADLOCK_MS = 1e3 * 60 * 0.5; // 30s

/**
 * HOPR SDK options.
 */
export type HoprSdkOps = {
  client: string;
  timeout: number;
  discoveryPlatformApiEndpoint: string;
  reliabilityScoreFreshNodeThreshold?: number;
  reliabilityScoreMaxResponses?: number;
  forceRpchCryptoModule?: "web" | "nodejs" | "no-modules";
  noModulesWasmLoader?: () => Promise<any>;
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
  private crypto?: any;
  // single interval for the SDK for things that need to be checked.
  private intervals: NodeJS.Timer[] = [];
  private segmentCache: SegmentCache;
  private requestCache: RequestCache;
  private reliabilityScore: ReliabilityScore;
  // selected entry node
  private entryNode?: EntryNode;
  // available exit nodes
  private exitNodes: ExitNode[] = [];
  // stopMessageListener
  private stopMessageListener?: () => void;
  // an epoch timestamp that stops creating requests until that time has passed
  public deadlockTimestamp: number | undefined;
  // toggle to not select entry nodes while another one is being selected
  private selectingEntryNode: boolean | undefined;

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
    return !!this.entryNode && this.exitNodes.length > 0;
  }

  /**
   * Requests the Discovery Platform for an Entry Node.
   * @param discoveryPlatformApiEndpoint
   * @return entry node details
   */
  private async selectEntryNode(
    discoveryPlatformApiEndpoint: string,
    exclusionList?: string[]
  ): Promise<{
    apiEndpoint: string;
    apiToken: string;
    peerId: string;
  }> {
    log.verbose("Selecting entry node");
    const rawResponse: globalThis.Response = await fetch(
      new URL(
        "/api/v1/request/entry-node",
        discoveryPlatformApiEndpoint
      ).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Content": "application/json",
        },
        body: JSON.stringify({
          client: this.ops.client,
          exclusionList,
        }),
      }
    );

    const response: {
      hoprd_api_endpoint: string;
      accessToken: string;
      id: string;
    } = await rawResponse.json();

    // Check for error response
    if (rawResponse.status !== 200) {
      log.error("Failed to request entry node", rawResponse.status, response);
      throw new Error(`Failed to request entry node`);
    }

    const apiEndpointUrl = new URL(response.hoprd_api_endpoint);

    this.entryNode = {
      apiEndpoint: apiEndpointUrl.toString(),
      apiToken: response.accessToken,
      peerId: response.id,
    };
    log.verbose("Selected entry node", this.entryNode);

    // Refresh messageListener
    if (this.stopMessageListener) this.stopMessageListener();
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
    return this.entryNode;
  }

  /**
   * Updates exit node list from the Discovery Platform
   * @param discoveryPlatformApiEndpoint
   * @returns list of exit nodes
   */
  private async fetchExitNodes(
    discoveryPlatformApiEndpoint: string
  ): Promise<ExitNode[]> {
    log.verbose("Fetching exit nodes");
    const response: {
      exit_node_pub_key: string;
      id: string;
    }[] = await fetch(
      new URL(
        "/api/v1/node?hasExitNode=true",
        discoveryPlatformApiEndpoint
      ).toString()
    ).then((res) => res.json());

    this.exitNodes = response.map((item) => ({
      peerId: item.id,
      pubKey: item.exit_node_pub_key,
    }));

    if (this.exitNodes.length === 0) throw Error("No exit nodes available");

    log.verbose("Fetched exit nodes", this.exitNodes.length);
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
    // @ts-ignore
    this.reliabilityScore.addMetric(req.entryNodeDestination, req.id, "failed");
    log.normal("request %s expired", req.id);
  }

  /**
   * Start the SDK and initialize necessary data.
   */
  public async start(): Promise<void> {
    if (this.isReady) return;

    if (!this.ops.noModulesWasmLoader) {
      throw Error("A wasm loader must be provided when 'no-modules' is used");
    }
    this.crypto = RPChCryptoNoModules;
    const wasmModule = await this.ops.noModulesWasmLoader();
    // @ts-ignore
    this.crypto.initSync(wasmModule);
    this.crypto.set_panic_hook();

    // // if nodejs is forced or derived
    // if (
    //   this.ops.forceRpchCryptoModule === "nodejs" ||
    //   (!this.ops.forceRpchCryptoModule && typeof window === "undefined")
    // ) {
    //   log.verbose("Using 'node' RPCh crypto implementation");
    //   this.crypto =
    //     require("@rpch/crypto-bridge/build/nodejs") as typeof RPChCryptoNode;
    // }
    // // if no-modules if forced
    // else if (this.ops.forceRpchCryptoModule === "no-modules") {
    //   if (!this.ops.noModulesWasmLoader) {
    //     throw Error("A wasm loader must be provided when 'no-modules' is used");
    //   }
    //   this.crypto = (await import(
    //     // @ts-expect-error
    //     "@rpch/crypto-bridge/build/no-modules"
    //   )) as typeof RPChCryptoNode;
    //   const wasmModule = await this.ops.noModulesWasmLoader();
    //   // @ts-ignore
    //   this.crypto.initSync(wasmModule);
    // }
    // // default to web
    // else {
    //   log.verbose("Using 'web' RPCh crypto implementation");
    //   this.crypto = (await import(
    //     "@rpch/crypto-bridge/build/web"
    //   )) as typeof RPChCryptoWeb;
    //   // @ts-expect-error
    //   await this.crypto.init();
    // }

    // check for expires caches every second
    this.intervals.push(
      setInterval(() => {
        this.segmentCache.removeExpired(this.ops.timeout);
        this.requestCache.removeExpired(this.ops.timeout);
      }, 1e3)
    );
    // update exit nodes every minute
    this.intervals.push(
      setInterval(() => {
        this.fetchExitNodes(this.ops.discoveryPlatformApiEndpoint);
      }, 60e3)
    );

    await this.selectEntryNode(this.ops.discoveryPlatformApiEndpoint);
    await this.fetchExitNodes(this.ops.discoveryPlatformApiEndpoint);
  }

  /**
   * Stop the SDK and clear up tangling processes.
   */
  public async stop(): Promise<void> {
    if (this.stopMessageListener) this.stopMessageListener();
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
  }

  /**
   * Creates a Request instance that can be sent through the RPCh network
   * @param provider
   * @param body
   * @returns Request
   */
  public async createRequest(provider: string, body: string): Promise<Request> {
    if (!this.isReady) throw Error("SDK not ready to create requests");
    if (this.isDeadlocked()) throw Error("SDK is deadlocked");
    if (this.selectingEntryNode) throw Error("SDK is selecting entry node");

    let entryNodeScore: number = this.reliabilityScore.getScore(
      this.entryNode!.peerId
    );
    const exclusionList: string[] = [];
    if (
      entryNodeScore < 0.7 &&
      this.reliabilityScore.getStatus(this.entryNode!.peerId) === "NON_FRESH"
    ) {
      log.verbose("node is not reliable enough. selecting new entry node");
      exclusionList.push(this.entryNode!.peerId);
      try {
        this.selectingEntryNode = true;
        await this.selectEntryNode(
          this.ops.discoveryPlatformApiEndpoint,
          exclusionList
        );
        this.selectingEntryNode = false;
      } catch (error) {
        log.error("Couldn't find elegible node: ", error);
        this.selectingEntryNode = false;
        this.setDeadlock(DEADLOCK_MS);
      }
      log.verbose("got new entry node");
    }

    // exclude entry node
    const eligibleExitNodes = this.exitNodes.filter(
      (node) => node.peerId !== this.entryNode?.peerId
    );
    const exitNode = utils.randomlySelectFromArray(eligibleExitNodes);
    return Request.createRequest(
      this.crypto!,
      provider,
      body,
      this.entryNode!.peerId,
      exitNode.peerId,
      this.crypto!.Identity.load_identity(etherUtils.arrayify(exitNode.pubKey))
    );
  }

  /**
   * Checks if sdk should be in deadlock
   * @returns boolean
   */
  private isDeadlocked(): boolean {
    if (!this.deadlockTimestamp) return false;
    const now = Date.now();
    if (now < this.deadlockTimestamp) {
      log.verbose("SDK is deadlocked until", this.deadlockTimestamp);
    }
    return now < this.deadlockTimestamp;
  }

  /**
   * Sets timestamp by adding time now and received parameter
   * @param timeInMs number
   */
  public setDeadlock(timeInMs: number): void {
    const now = Date.now();
    this.deadlockTimestamp = timeInMs + now;
    log.verbose("new deadlock timestamp", this.deadlockTimestamp);
  }

  /**
   * Sends a Request through the RPCh network
   * @param req Request
   * @returns Promise<Response>
   */
  public async sendRequest(req: Request): Promise<Response> {
    // Check if SDK is ready to send requests
    if (!this.isReady) {
      throw Error("SDK not ready to send requests");
    }

    // Check if SDK is deadlocked
    if (this.isDeadlocked()) {
      throw Error("SDK is deadlocked");
    }

    return new Promise(async (resolve, reject) => {
      const message = req.toMessage();
      const segments = message.toSegments();

      // Add request to request cache
      this.requestCache.addRequest(req, resolve, reject);

      // Send all segments in parallel using Promise.allSettled
      const sendMessagePromises = segments.map((segment) => {
        return hoprd.sendMessage({
          apiEndpoint: this.entryNode!.apiEndpoint,
          apiToken: this.entryNode!.apiToken,
          message: segment.toString(),
          destination: req.exitNodeDestination,
          path: [],
        });
      });

      // Wait for all promises to settle, then check if any were rejected
      try {
        const results = await Promise.allSettled(sendMessagePromises);

        const rejectedResults = results.filter(
          (result) => result.status === "rejected"
        );

        if (rejectedResults.length > 0) {
          // If any promises were rejected, remove request from cache and reject promise
          this.onRequestRemoval(req);
          this.requestCache.removeRequest(req);
          reject("failed to send message to hoprd");
        }
      } catch (e) {
        // If there was an error sending the request, remove request from cache and reject promise
        log.error("failed to send message to hoprd", e);
        this.onRequestRemoval(req);
        this.requestCache.removeRequest(req);
        reject("failed to send message to hoprd");
      }
    });
  }
}
