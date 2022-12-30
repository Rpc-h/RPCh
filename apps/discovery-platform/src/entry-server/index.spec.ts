import assert from "assert";
import { DBInstance } from "../db";
import request from "supertest";
import { Express } from "express";
import { doesClientHaveQuota, entryServer } from ".";
import {
  CreateRegisteredNode,
  QueryRegisteredNode,
} from "../registered-node/dto";
import { FundingPlatformApi } from "../funding-platform-api";
import * as registeredNode from "../registered-node";
import nock from "nock";
import {
  getAccessTokenResponse,
  postFundingResponse,
} from "../funding-platform-api/dto";
import { MockPgInstanceSingleton } from "../db/index.spec";

const FUNDING_PLATFORM_URL = "http://localhost:5000";
const ACCESS_TOKEN = "ACCESS";
const BASE_QUOTA = 1;
const FAKE_ACCESS_TOKEN = "EcLjvxdALOT0eq18d8Gzz3DEr3AMG27NtL+++YPSZNE=";

const nockFundingRequest = (peerId: string) =>
  nock(FUNDING_PLATFORM_URL).post(`/api/request/funds/${peerId}`);
const nockGetApiAccessToken =
  nock(FUNDING_PLATFORM_URL).get("/api/access-token");

const mockNode = (peerId?: string, hasExitNode?: boolean) =>
  ({
    hasExitNode: hasExitNode ?? true,
    peerId: peerId ?? "peerId",
    chainId: 100,
    ports: {
      exitNodePort: 3000,
      hoprApiEndpoint: "localhost",
      hoprApiPort: 5000,
    },
  } as CreateRegisteredNode);

describe("test entry server", function () {
  let dbInstance: DBInstance;
  let app: Express;

  beforeAll(async function () {
    dbInstance = MockPgInstanceSingleton.getDbInstance();
    MockPgInstanceSingleton.getInitialState();
  });

  beforeEach(async function () {
    MockPgInstanceSingleton.getInitialState().restore();
    const fundingPlatformApi = new FundingPlatformApi(
      FUNDING_PLATFORM_URL,
      dbInstance
    );
    app = entryServer({
      db: dbInstance,
      baseQuota: BASE_QUOTA,
      accessToken: ACCESS_TOKEN,
      fundingPlatformApi,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("should register a node", async function () {
    const node = mockNode();
    await request(app).post("/api/node/register").send(node);
    const createdNode = await request(app).get(`/api/node/${node.peerId}`);
    assert.equal(createdNode.body.node.peerId, node.peerId);
  });

  it("should get a node", async function () {
    const node = mockNode();
    await request(app).post("/api/node/register").send(node);
    await request(app).post("/api/node/register").send(mockNode("fake"));
    const createdNode = await request(app).get(`/api/node/${node.peerId}`);
    assert.equal(createdNode.body.node.peerId, node.peerId);
  });

  it("should get all nodes", async function () {
    await request(app)
      .post("/api/node/register")
      .send(mockNode("notExit1", false));
    await request(app)
      .post("/api/node/register")
      .send(mockNode("notExit2", false));
    await request(app).post("/api/node/register").send(mockNode("exit3", true));
    await request(app).post("/api/node/register").send(mockNode("exit4", true));

    const allExitNodes = await request(app).get(
      `/api/node?hasExitNode=${false}`
    );

    assert(typeof allExitNodes.body === "object" && allExitNodes.body.length);
  });

  it("should add quota to a client", async function () {
    const createdQuota = await request(app).post("/api/client/funds").send({
      client: "client",
      quota: 1,
    });
    assert.equal(createdQuota.body.quota.quota, 1);
  });

  // it("should now allow request client does not have enough quota", async function () {
  //   const doesClientHaveQuotaResponse = await doesClientHaveQuota(
  //     {
  //       data: {
  //         quotas: [
  //           {
  //             client: "client3",
  //             quota: 1,
  //             action_taker: "test",
  //           },
  //         ],
  //         registeredNodes: [],
  //       },
  //     },
  //     "client2",
  //     2
  //   );

  //   assert(!doesClientHaveQuotaResponse);
  // });
  // it("should allow request because client has enough quota", async function () {
  //   const doesClientHaveQuotaResponse = await doesClientHaveQuota(
  //     {
  //       data: {
  //         quotas: [
  //           {
  //             client: "client3",
  //             quota: 1,
  //             action_taker: "test",
  //           },
  //         ],
  //         registeredNodes: [],
  //       },
  //     },
  //     "client3",
  //     1
  //   );

  //   assert(doesClientHaveQuotaResponse);
  // });
  describe("should select an entry node", function () {
    it("should return an entry node", async function () {
      const spy = jest.spyOn(registeredNode, "getEligibleNode");
      const amountLeft = 10;
      const peerId = "entry";
      const requestId = 1;

      nockGetApiAccessToken.reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft: 10,
        expiredAt: new Date().toISOString(),
      } as getAccessTokenResponse);

      await request(app).post("/api/client/funds").send({
        client: "client",
        quota: 1,
      });

      await request(app)
        .post("/api/node/register")
        .send(mockNode(peerId, true));

      const createdNode = (await request(app).get(`/api/node/${peerId}`)) as {
        body: { node: QueryRegisteredNode | undefined };
      };

      spy.mockImplementation(async () => {
        return createdNode.body.node;
      });

      nockFundingRequest(peerId).reply(200, {
        amountLeft,
        id: requestId,
      } as postFundingResponse);

      const requestResponse = await request(app)
        .get("/api/request/entry-node")
        .send({ client: "client" });

      assert.equal(requestResponse.body.peerId, createdNode.body.node?.id);
      spy.mockRestore();
    });
    it("should fail if no entry node is selected", async function () {
      const spy = jest.spyOn(registeredNode, "getEligibleNode");
      const amountLeft = 10;
      const peerId = "entry";
      const requestId = 1;

      nockGetApiAccessToken.reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft: 10,
        expiredAt: new Date().toISOString(),
      } as getAccessTokenResponse);

      await request(app).post("/api/client/funds").send({
        client: "client",
        quota: 1,
      });

      spy.mockImplementation(async () => undefined);

      nockFundingRequest(peerId).reply(200, {
        amountLeft,
        id: requestId,
      } as postFundingResponse);

      const requestResponse = await request(app)
        .get("/api/request/entry-node")
        .send({ client: "client" });

      assert.equal(requestResponse.body.body, "Could not find eligible node");
      spy.mockRestore();
    });
    it("should reduce client quota", async function () {
      const spy = jest.spyOn(registeredNode, "getEligibleNode");
      const amountLeft = 10;
      const peerId = "entry";
      const requestId = 1;

      nockGetApiAccessToken.reply(200, {
        accessToken: FAKE_ACCESS_TOKEN,
        amountLeft: 10,
        expiredAt: new Date().toISOString(),
      } as getAccessTokenResponse);

      await request(app).post("/api/client/funds").send({
        client: "newClient",
        quota: BASE_QUOTA,
      });

      await request(app)
        .post("/api/node/register")
        .send(mockNode(peerId, true));

      const createdNode = (await request(app).get(`/api/node/${peerId}`)) as {
        body: { node: QueryRegisteredNode | undefined };
      };

      spy.mockImplementation(async () => {
        return createdNode.body.node;
      });

      nockFundingRequest(peerId).reply(200, {
        amountLeft,
        id: requestId,
      } as postFundingResponse);

      await request(app)
        .get("/api/request/entry-node")
        .send({ client: "newClient" });

      const requestResponse = await request(app)
        .get("/api/request/entry-node")
        .send({ client: "newClient" });

      assert.equal(
        requestResponse.body.body,
        "Client does not have enough quota"
      );
      spy.mockRestore();
    });
  });
});
