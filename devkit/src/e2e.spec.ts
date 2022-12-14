import assert from "assert";
import * as ethers from "rpch-ethers";
import { fixtures } from "rpch-common";

const PROVIDER_URL = fixtures.PROVIDER;
const DISCOVERY_PLATFORM_API_ENDPOINT = "http://discovery_platform";
const ENTRY_NODE_API_ENDPOINT = "http://localhost:13301";
const ENTRY_NODE_API_TOKEN = "^^awesomeHOPRr3l4y^^";
const ENTRY_NODE_PEER_ID =
  "16Uiu2HAmFKxYVn95UhmEzEvdgkCcrwAimWQHt3dppPxsYhyz1dQJ";
const EXIT_NODE_PEER_ID =
  "16Uiu2HAm28BratT3U1r4eabs5EKYTv3jXbLUNTTNdLSPYadRAUr2";

// jest.setTimeout(1e4);
describe("e2e tests", function () {
  const provider = new ethers.RPChProvider(PROVIDER_URL, {
    discoveryPlatformApiEndpoint: DISCOVERY_PLATFORM_API_ENDPOINT,
    entryNodeApiEndpoint: ENTRY_NODE_API_ENDPOINT,
    entryNodeApiToken: ENTRY_NODE_API_TOKEN,
    entryNodePeerId: ENTRY_NODE_PEER_ID,
    exitNodePeerId: EXIT_NODE_PEER_ID,
  });

  beforeAll(async function () {
    await provider.sdk.start();
  });

  afterAll(async function () {
    await provider.sdk.stop();
  });

  it("should get chain id", async function () {
    const network = await provider.getNetwork();
    assert.equal(network.chainId, 100);
  });

  it("should get block number", async function () {
    const blockNumber = await provider.getBlockNumber();
    assert.equal(typeof blockNumber, "number");
  });

  it("should get balance", async function () {
    const balance = await provider.getBalance(
      "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
    );
    assert.equal(balance._isBigNumber, true);
  });

  // it("should get ether price", async function () {
  //   const etherPrice = await provider.getEtherPrice();
  //   assert.equal(etherPrice, 25135304);
  // });
});
