import assert from "assert";
import nock from "nock";
import { type Message, Request, Response } from "@rpch/common";
import * as fixtures from "@rpch/common/build/fixtures";
import * as crypto from "@rpch/crypto/nodejs";
import { RPChProvider } from ".";

const PROVIDER_URL = fixtures.PROVIDER;
const TIMEOUT = 5e3;
const DISCOVERY_PLATFORM_API_ENDPOINT = "http://discovery_platform";
const ENTRY_NODE_API_ENDPOINT = "http://entry_node";
const ENTRY_NODE_API_PORT = "1337";
const ENTRY_NODE_API_TOKEN = "12345";
const ENTRY_NODE_PEER_ID = fixtures.HOPRD_PEER_ID_A;
const EXIT_NODE_PEER_ID = fixtures.EXIT_NODE_HOPRD_PEER_ID_A;
const EXIT_NODE_PUB_KEY = fixtures.EXIT_NODE_PUB_KEY_A;
const EXIT_NODE_WRITE_IDENTITY = fixtures.EXIT_NODE_WRITE_IDENTITY_A;

const sdkStore = fixtures.createAsyncKeyValStore();
const exitNodeStore = fixtures.createAsyncKeyValStore();

const getMockedResponse = async (request: Request): Promise<Message> => {
  const rpcId: number = JSON.parse(request.body)["id"];
  let body: string = "";
  if (request.body.includes("eth_chainId")) {
    body = `{"jsonrpc": "2.0","result": "0x01","id": ${rpcId}}`;
  } else if (request.body.includes("eth_blockNumber")) {
    body = `{"jsonrpc": "2.0","result": "0x17f88c8","id": ${rpcId}}`;
  }

  await fixtures.wait(10);

  const counter = await exitNodeStore
    .get(request.entryNodeDestination)
    .then((v) => BigInt(v || "0"));
  const exitNodeRequest = Request.fromMessage(
    crypto,
    request.toMessage(),
    EXIT_NODE_PEER_ID,
    EXIT_NODE_WRITE_IDENTITY,
    counter,
    (clientId: string, counter: bigint) => {
      return exitNodeStore.set(clientId, counter.toString());
    }
  );
  const exitNodeResponse = Response.createResponse(
    crypto,
    exitNodeRequest,
    body
  );

  await fixtures.wait(10);

  return exitNodeResponse.toMessage();
};

jest.mock("@rpch/common", () => ({
  ...jest.requireActual("@rpch/common"),
  hoprd: {
    sendMessage: jest.fn(async () => "MOCK_SEND_MSG_RESPONSE"),
    createMessageListener: jest.fn(async () => {
      return () => {};
    }),
  },
}));

describe("test index.ts", function () {
  // pseudo responses from entry node
  fixtures
    .nockSendMessageApi(nock(ENTRY_NODE_API_ENDPOINT).persist())
    .reply(202, "someresponse");

  nock(DISCOVERY_PLATFORM_API_ENDPOINT)
    .post("/api/request/entry-node")
    .reply(200, {
      hoprd_api_endpoint: ENTRY_NODE_API_ENDPOINT,
      hoprd_api_port: ENTRY_NODE_API_PORT,
      accessToken: ENTRY_NODE_API_TOKEN,
      id: ENTRY_NODE_PEER_ID,
    })
    .persist();

  nock(DISCOVERY_PLATFORM_API_ENDPOINT)
    .get("/api/node?hasExitNode=true")
    .reply(200, [
      {
        exit_node_pub_key: EXIT_NODE_PUB_KEY,
        id: EXIT_NODE_PEER_ID,
      },
    ])
    .persist();

  const provider = new RPChProvider(
    PROVIDER_URL,
    {
      timeout: TIMEOUT,
      discoveryPlatformApiEndpoint: DISCOVERY_PLATFORM_API_ENDPOINT,
    },
    sdkStore.set,
    sdkStore.get
  );

  beforeAll(async function () {
    await provider.sdk.start();
  });

  afterAll(async function () {
    await provider.sdk.stop();
  });

  // hook to emulate responses from the exit node
  const originalSendRequest = provider.sdk.sendRequest.bind(provider.sdk);
  provider.sdk.sendRequest = async (request: Request): Promise<Response> => {
    setTimeout(() => {
      getMockedResponse(request).then((responseMessage) => {
        // @ts-ignore
        provider.sdk.onMessage(responseMessage);
      });
    }, 100);
    return originalSendRequest(request);
  };

  it("should get chain id", async function () {
    const network = await provider.getNetwork();
    assert.equal(network.chainId, 1);
  });

  it("should get block number", async function () {
    const blockNumber = await provider.getBlockNumber();
    assert.equal(blockNumber, 25135304);
  });
});
