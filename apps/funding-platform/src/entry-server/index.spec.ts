import { assert } from "chai";
import { Express } from "express";
import { IBackup, IMemoryDb } from "pg-mem";
import request from "supertest";
import { AccessTokenService } from "../access-token";
import { DBInstance } from "../db";
import { mockPgInstance } from "../db/index.spec";
import { RequestService } from "../request";
import { entryServer } from ".";

const SECRET_KEY = "SECRET";
const MAX_AMOUNT_OF_TOKENS = 40;
const TIMEOUT = 30;

describe("test entry server", function () {
  let dbInstance: DBInstance;
  let accessTokenService: AccessTokenService;
  let requestService: RequestService;
  let app: Express | undefined;
  let agent: request.SuperTest<request.Test>;
  let pgInstance: IMemoryDb;
  let initialDbState: IBackup;

  beforeAll(async function () {
    pgInstance = await mockPgInstance();
    initialDbState = pgInstance.backup();
    dbInstance = pgInstance.adapters.createPgPromise();
  });

  beforeEach(function () {
    initialDbState.restore();
    accessTokenService = new AccessTokenService(dbInstance, SECRET_KEY);
    requestService = new RequestService(dbInstance);
    app = entryServer({
      accessTokenService,
      requestService,
      walletAddress: "0x0000000000000000",
      maxAmountOfTokens: MAX_AMOUNT_OF_TOKENS,
      timeout: TIMEOUT,
    });
    agent = request(app);
  });

  it("should return token", async function () {
    return await agent
      .get("/api/access-token")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
  });
  it("should accept valid tokens", async function () {
    const responseToken = await agent
      .get("/api/access-token")
      .set("Accept", "application/json");
    return agent
      .get("/api/request/status")
      .set("Accept", "application/json")
      .set("x-access-token", responseToken.body.accessToken)
      .expect("Content-Type", /json/)
      .expect(200);
  });
  it("should not accept expired tokens", async function () {
    let spy = jest
      .spyOn(AccessTokenService.prototype, "getAccessToken")
      .mockImplementation(
        async (token) => ({ token, expired_at: new Date("2020-10-10") } as any)
      );

    const responseToken = await agent
      .get("/api/access-token")
      .set("Accept", "application/json");

    await agent
      .get("/api/request/status")
      .set("Accept", "application/json")
      .set("x-access-token", responseToken.body.accessToken)
      .expect("Content-Type", /json/)
      .expect(401);

    spy.mockRestore();
  });
  it("should not accept requests without access tokens", async function () {
    return await agent
      .get("/api/request/status")
      .set("Accept", "application/json")
      .expect(400);
  });
  it("should not accept requests with invented access token", async function () {
    return await agent
      .get("/api/request/status")
      .set("Accept", "application/json")
      .set("x-access-token", "invented_token")
      .expect("Content-Type", /json/)
      .expect(404);
  });
  it("should not accept requests with token that has exceeded max amount of tokens", async function () {
    const responseToken = await agent
      .get("/api/access-token")
      .set("Accept", "application/json");

    await agent
      .post("/api/request/funds/0x0000000000000000")
      .send({ amount: MAX_AMOUNT_OF_TOKENS - 1, chainId: 80 })
      .set("Accept", "application/json")
      .set("x-access-token", responseToken.body.accessToken);

    await agent
      .post("/api/request/funds/0x0000000000000000")
      .send({ amount: MAX_AMOUNT_OF_TOKENS, chainId: 80 })
      .set("Accept", "application/json")
      .set("x-access-token", responseToken.body.accessToken)
      .expect("Content-Type", /json/)
      .expect(401);
  });
  it("should return correct amount left", async function () {
    const responseToken = await agent
      .get("/api/access-token")
      .set("Accept", "application/json");

    const resFunding = await agent
      .post("/api/request/funds/0x0000000000000000")
      .send({ amount: MAX_AMOUNT_OF_TOKENS - 10, chainId: 80 })
      .set("Accept", "application/json")
      .set("x-access-token", responseToken.body.accessToken);

    assert.equal(resFunding.body.amountLeft, 10);
  });
  describe("should validate body before trying a funding request", function () {
    it("should fail if amount is missing on funding request", async function () {
      const responseToken = await agent
        .get("/api/access-token")
        .set("Accept", "application/json");

      await agent
        .post("/api/request/funds/0x0000000000000000")
        .send({ chainId: 80 })
        .set("Accept", "application/json")
        .set("x-access-token", responseToken.body.accessToken)
        .expect(400);
    });
    it("should fail if chainId is missing on funding request", async function () {
      const responseToken = await agent
        .get("/api/access-token")
        .set("Accept", "application/json");

      await agent
        .post("/api/request/funds/0x0876545")
        .send({ amount: MAX_AMOUNT_OF_TOKENS })
        .set("Accept", "application/json")
        .set("x-access-token", responseToken.body.accessToken)
        .expect(400);
    });
  });
  it("should not allow querying requests with a non numeric id", async function () {
    const responseToken = await agent
      .get("/api/access-token")
      .set("Accept", "application/json");

    await agent
      .get("/api/request/status/0x0")
      .set("Accept", "application/json")
      .set("x-access-token", responseToken.body.accessToken)
      .expect(400);
  });
});
