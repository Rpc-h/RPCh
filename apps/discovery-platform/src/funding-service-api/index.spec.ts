import assert from "assert";
import { FundingServiceApi } from ".";
import * as db from "../db";
import nock from "nock";
import {
  getAccessTokenResponse,
  getRequestStatusResponse,
  postFundingResponse,
} from "./dto";
import { QueryRegisteredNode } from "../registered-node/dto";
import { MockPgInstanceSingleton } from "../db/index.spec";

const FUNDING_SERVICE_URL = "http://localhost:5000";
const FAKE_ACCESS_TOKEN = "EcLjvxdALOT0eq18d8Gzz3DEr3AMG27NtL+++YPSZNE=";

const nockGetApiAccessToken =
  nock(FUNDING_SERVICE_URL).get("/api/access-token");
const nockFundingRequest = (id: string) =>
  nock(FUNDING_SERVICE_URL).post(`/api/request/funds/${id}`);
const nockRequestStatus = (requestId: number) =>
  nock(FUNDING_SERVICE_URL).get(`/api/request/status/${requestId}`);
const nockGetFunds = nock(FUNDING_SERVICE_URL).get("/api/funds");

const createMockNode = (peerId?: string) =>
  ({
    chain_id: 100,
    id: peerId ?? "peerId",
    has_exit_node: true,
    honesty_score: 0,
    status: "FRESH",
    total_amount_funded: 0,
    hoprd_api_endpoint: "localhost",
    hoprd_api_port: 5000,
  } as QueryRegisteredNode);

describe("test funding service api class", function () {
  let fundingServiceApi: FundingServiceApi;
  let dbInstance: db.DBInstance;

  beforeAll(async function () {
    dbInstance = MockPgInstanceSingleton.getDbInstance();
    MockPgInstanceSingleton.getInitialState();
  });

  beforeEach(function () {
    MockPgInstanceSingleton.getInitialState().restore();
    fundingServiceApi = new FundingServiceApi(FUNDING_SERVICE_URL, dbInstance);
  });

  it("should fetch access token and save it to instance", async function () {
    nockGetApiAccessToken.reply(200, {
      accessToken: FAKE_ACCESS_TOKEN,
      amountLeft: 10,
      expiredAt: new Date(Date.now()).toISOString(),
    } as getAccessTokenResponse);
    // @ts-ignore-next-line
    const res = await fundingServiceApi.fetchAccessToken();
    // @ts-ignore-next-line
    assert.equal(res, FAKE_ACCESS_TOKEN);
  });

  describe("validate token", function () {
    it("should return true if token is valid", async function () {
      const now = new Date(Date.now());
      now.setMinutes(now.getMinutes() + 30);
      nockGetApiAccessToken.reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft: 10,
        expiredAt: now.toISOString(),
      } as getAccessTokenResponse);
      // @ts-ignore-next-line
      await fundingServiceApi.fetchAccessToken();
      // @ts-ignore-next-line
      const isTokenValid = fundingServiceApi.accessTokenIsValid();
      assert(isTokenValid);
    });
    it("should return false if token is expired", async function () {
      const now = new Date(Date.now());
      now.setMinutes(now.getMinutes() - 30);
      nockGetApiAccessToken.reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft: 10,
        expiredAt: now.toISOString(),
      } as getAccessTokenResponse);
      // @ts-ignore-next-line
      await fundingServiceApi.fetchAccessToken();
      // @ts-ignore-next-line
      const isTokenValid = fundingServiceApi.accessTokenIsValid();
      assert(!isTokenValid);
    });
    it("should return false if token does not exist", function () {
      // @ts-ignore-next-line
      const isTokenValid = fundingServiceApi.accessTokenIsValid();
      assert(!isTokenValid);
    });
    it("should return false if has been exceeded max amount", async function () {
      const now = new Date(Date.now());
      now.setMinutes(now.getMinutes() + 30);
      nockGetApiAccessToken.reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft: 9,
        expiredAt: now.toISOString(),
      } as getAccessTokenResponse);
      // @ts-ignore-next-line
      await fundingServiceApi.fetchAccessToken();
      // @ts-ignore-next-line
      const isTokenValid = fundingServiceApi.accessTokenIsValid(10);
      assert(!isTokenValid);
    });
  });
  it("should save access token", function () {
    const now = new Date(Date.now());
    now.setMinutes(now.getMinutes() + 30);
    const amountLeft = 30;
    // @ts-ignore
    fundingServiceApi.saveAccessToken({
      accessToken: FAKE_ACCESS_TOKEN,
      amountLeft: amountLeft,
      expiredAt: now.toISOString(),
    });
    // @ts-ignore
    assert(fundingServiceApi.accessToken, FAKE_ACCESS_TOKEN);
    // @ts-ignore
    assert(fundingServiceApi.amountLeft, amountLeft);
    // @ts-ignore
    assert(fundingServiceApi.expiredAt, now.toISOString());
  });
  it("should get access token", async function () {
    nockGetApiAccessToken.reply(200, {
      accessToken: FAKE_ACCESS_TOKEN,
      amountLeft: 10,
      expiredAt: new Date().toISOString(),
    } as getAccessTokenResponse);

    // @ts-ignore
    const accessToken = await fundingServiceApi.getAccessToken();

    assert.equal(accessToken, FAKE_ACCESS_TOKEN);
  });
  it("should request funds", async function () {
    const node = createMockNode("peer1");
    const amountLeft = 10;
    const requestId = 123;

    nockGetApiAccessToken.reply(200, {
      accessToken: FAKE_ACCESS_TOKEN,
      amountLeft: 10,
      expiredAt: new Date().toISOString(),
    } as getAccessTokenResponse);

    nockFundingRequest("peer1").reply(200, {
      amountLeft,
      id: requestId,
    } as postFundingResponse);

    await db.saveRegisteredNode(dbInstance, node);
    const fundingResponse = await fundingServiceApi.requestFunds(5, node);
    const dbNode = await db.getRegisteredNode(dbInstance, "peer1");

    assert.equal(dbNode?.status, "FUNDING");
    assert.equal(
      // @ts-ignore
      fundingServiceApi.pendingRequests.get("peer1")?.requestId,
      fundingResponse
    );
  });
  it("should get request status", async function () {
    const requestId = 123;

    nockGetApiAccessToken.reply(200, {
      accessToken: FAKE_ACCESS_TOKEN,
      amountLeft: 10,
      expiredAt: new Date().toISOString(),
    } as getAccessTokenResponse);

    nockRequestStatus(requestId).reply(200, {
      accessTokenHash: "hash",
      amount: "10",
      chainId: 10,
      createdAt: new Date(),
      nodeAddress: "peer",
      requestId,
      status: "FRESH",
    } as getRequestStatusResponse);

    // @ts-ignore
    const requestStatus = await fundingServiceApi.getRequestStatus(requestId);

    assert.equal(requestStatus.status, "FRESH");
  });
  it("should save pending request", function () {
    // @ts-ignore
    fundingServiceApi.savePendingRequest("peer1", 123, 0);

    assert.equal(
      // @ts-ignore
      fundingServiceApi.pendingRequests.get("peer1")?.requestId,
      123
    );
    assert.equal(
      // @ts-ignore
      fundingServiceApi.pendingRequests.get("peer1")?.amountOfRetries,
      0
    );
  });
  describe("check pending requests", function () {
    it("should update db and delete request from pending request if it passed successfully", async function () {
      const node = createMockNode("peer1");
      const amountLeft = 10;
      const requestId = 123;

      nockGetApiAccessToken.twice().reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft: 10,
        expiredAt: new Date().toISOString(),
      } as getAccessTokenResponse);

      nockFundingRequest(node.id).reply(200, {
        amountLeft,
        id: requestId,
      } as postFundingResponse);

      await db.saveRegisteredNode(dbInstance, node);

      const fundingResponse = await fundingServiceApi.requestFunds(5, node);

      nockRequestStatus(fundingResponse).reply(200, {
        accessTokenHash: "hash",
        amount: "5",
        chainId: node.chain_id,
        createdAt: new Date(),
        nodeAddress: node.id,
        requestId,
        status: "SUCCESS",
      } as getRequestStatusResponse);

      await fundingServiceApi.checkForPendingRequests();
      const dbNode = await db.getRegisteredNode(dbInstance, node.id);

      assert.equal(
        // @ts-ignore
        fundingServiceApi.pendingRequests.has(node.peerId),
        false
      );
      assert.equal(
        // @ts-ignore
        dbNode.status,
        "READY"
      );
      assert.equal(
        // @ts-ignore
        dbNode?.total_amount_funded,
        "5"
      );
    });
    it("should not do anything if request is still pending", async function () {
      const node = createMockNode("peer1");
      const amountLeft = 10;
      const requestId = 123;

      nockGetApiAccessToken.twice().reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft,
        expiredAt: new Date().toISOString(),
      } as getAccessTokenResponse);

      nockFundingRequest(node.id).reply(200, {
        amountLeft,
        id: requestId,
      } as postFundingResponse);

      await db.saveRegisteredNode(dbInstance, node);

      const fundingResponse = await fundingServiceApi.requestFunds(5, node);

      nockRequestStatus(fundingResponse).reply(200, {
        accessTokenHash: "hash",
        amount: "5",
        chainId: node.chain_id,
        createdAt: new Date(),
        nodeAddress: node.id,
        requestId,
        status: "PENDING",
      } as getRequestStatusResponse);

      await fundingServiceApi.checkForPendingRequests();
      const dbNode = await db.getRegisteredNode(dbInstance, node.id);

      assert.equal(
        // @ts-ignore
        fundingServiceApi.pendingRequests.has(node.id),
        true
      );
      assert.equal(
        // @ts-ignore
        dbNode.status,
        "FUNDING"
      );
      assert.equal(
        // @ts-ignore
        dbNode?.total_amount_funded,
        "0"
      );
    });
    it("should retry request if request failed", async function () {
      const node = createMockNode("peer1");
      const amountLeft = 10;
      const requestId = 123;

      nockGetApiAccessToken.thrice().reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft,
        expiredAt: new Date().toISOString(),
      } as getAccessTokenResponse);

      nockFundingRequest(node.id)
        .twice()
        .reply(200, {
          amountLeft,
          id: requestId,
        } as postFundingResponse);

      await db.saveRegisteredNode(dbInstance, node);

      const fundingResponse = await fundingServiceApi.requestFunds(5, node);

      nockRequestStatus(fundingResponse).reply(200, {
        accessTokenHash: "hash",
        amount: "5",
        chainId: node.chain_id,
        createdAt: new Date(),
        nodeAddress: node.id,
        requestId,
        status: "FAILED",
      } as getRequestStatusResponse);

      await fundingServiceApi.checkForPendingRequests();
      const dbNode = await db.getRegisteredNode(dbInstance, node.id);

      assert.equal(
        // @ts-ignore
        fundingServiceApi.pendingRequests.has(node.id),
        true
      );
      assert.equal(
        // @ts-ignore
        fundingServiceApi.pendingRequests.get(node.id)?.amountOfRetries,
        1
      );
      assert.notEqual(dbNode?.status, "READY");
      assert.equal(dbNode?.total_amount_funded, "0");
    });
  });
  it("should get funding service funds", async function () {
    nockGetApiAccessToken.once().reply(200, {
      accessToken: FAKE_ACCESS_TOKEN,
      amountLeft: 10,
      expiredAt: new Date().toISOString(),
    } as getAccessTokenResponse);

    nockGetFunds.reply(200, {
      80: 10,
      100: 4000,
    });

    const funds = await fundingServiceApi.getAvailableFunds();

    assert.equal(funds[80], 10);
  });
});
