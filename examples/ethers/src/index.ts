import SDK, { JRPC } from '@rpch/sdk';
import { JsonRpcProvider, JsonRpcPayload, JsonRpcResult } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();
/**
 * The RPCh ethers adapter is an extension of the original
 *  JsonRpcProvider which allows clients to use drop-in and replace,
 * so they can send their RPC requests through the RPCh network.
 */
export class RPChProvider extends JsonRpcProvider {
    constructor(
        public readonly url: string,
        public readonly sdk: SDK,
    ) {
        super(url);
    }

    async send(method: string, params: Array<any> | Record<string, any>): Promise<any> {
        // All requests are over HTTP, so we can just start handling requests
        // We do this here rather than the constructor so that we don't send any
        // requests to the network (i.e. eth_chainId) until we absolutely have to.
        await this._start();

        return await super.send(method, params);
    }

    /**
     * sends singular or multiple requests through RPCh network
     */
    async _send(payload: JsonRpcPayload | Array<JsonRpcPayload>): Promise<Array<JsonRpcResult>> {
        try {
            const payloads = Array.isArray(payload) ? payload : [payload];
            const responses = await Promise.all(
                payloads.map(async (payload) => (await this.sdk.send(payload)).json()),
            );
            // responses need to have a response property
            // and the id needs to be a number to meet the type
            // requirements for JsonRpcResult
            return responses.map((res) => ({
                ...res,
                id: Number(res.id),
                result: JRPC.isError(res) ? res.error : res.result,
            }));
        } catch (error) {
            console.log(error);
            this.emit('debug', {
                action: 'response',
                error: error,
                provider: this,
            });

            throw error;
        }
    }
}

/**
 * Example of how to use RPChProvider
 */
async function example() {
    // this client secret can be found in your dashboard
    const sdk = new SDK(process.env.CLIENT_SECRET!);
    const provider = new RPChProvider('https://ethereum-provider.rpch.tech', sdk);
    const response = await provider.send('eth_blockNumber', []);
    return response;
}

example()
    .then((res) => console.log(res))
    .catch((err) => console.error(err));
