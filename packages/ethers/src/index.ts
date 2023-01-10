import { JsonRpcProvider } from "@ethersproject/providers";
import { deepCopy } from "@ethersproject/properties";
import SDK, { type HoprSdkOps } from "@rpch/sdk";
import { parseResponse, getResult, createLogger } from "./utils";

const log = createLogger();

export class RPChProvider extends JsonRpcProvider {
  public sdk: SDK;

  constructor(
    public readonly url: string,
    hoprSdkOps: HoprSdkOps,
    setKeyVal: (key: string, val: string) => Promise<any>,
    getKeyVal: (key: string) => Promise<string | undefined>
  ) {
    super(url);
    this.sdk = new SDK(hoprSdkOps, setKeyVal, getKeyVal);
  }

  public async send(method: string, params: Array<any>): Promise<any> {
    log.verbose("Using SEND", method);
    const payload = {
      method: method,
      params: params,
      id: this._nextId++,
      jsonrpc: "2.0",
    };

    this.emit("debug", {
      action: "request",
      request: deepCopy(payload),
      provider: this,
    });

    // We can expand this in the future to any call, but for now these
    // are the biggest wins and do not require any serializing parameters.
    const cache = ["eth_chainId", "eth_blockNumber"].indexOf(method) >= 0;
    if (cache && !!this._cache[method]) {
      return this._cache[method];
    }

    const rpchRequest = this.sdk.createRequest(
      this.url,
      JSON.stringify(payload)
    );
    log.verbose(
      "Created request",
      rpchRequest.id,
      log.createMetric({ id: rpchRequest.id })
    );

    try {
      const rpchResponsePromise = this.sdk.sendRequest(rpchRequest);
      log.verbose(
        "Send request",
        rpchRequest.id,
        log.createMetric({ id: rpchRequest.id })
      );

      // Cache the fetch, but clear it on the next event loop
      if (cache) {
        this._cache[method] = rpchResponsePromise;
        setTimeout(() => {
          // @ts-ignore-next-line
          this._cache[method] = null;
        }, 0);
      }

      const rpchResponse = await rpchResponsePromise;
      const response = getResult(parseResponse(rpchResponse));
      log.verbose(
        "Received response for request",
        rpchRequest.id,
        log.createMetric({ id: rpchRequest.id })
      );
      this.emit("debug", {
        action: "response",
        request: payload,
        response: response,
        provider: this,
      });

      return response;
    } catch (error) {
      log.error(
        "Did not receive response for request",
        rpchRequest.id,
        log.createMetric({ id: rpchRequest.id })
      );
      this.emit("debug", {
        action: "response",
        error: error,
        request: rpchRequest,
        provider: this,
      });

      throw error;
    }
  }
}
