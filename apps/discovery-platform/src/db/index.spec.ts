import assert from "assert";
import { QueryRegisteredNode } from "../registered-node/dto";
import * as db from "./";
import { CreateQuota } from "../quota/dto";
import { IBackup, IMemoryDb, newDb } from "pg-mem";
import fs from "fs";

export class MockPgInstanceSingleton {
  private static pgInstance: IMemoryDb;
  private static dbInstance: db.DBInstance;
  private static initialDbState: IBackup;

  private constructor() {
    let instance = newDb();
    instance.public.none(fs.readFileSync("dump.sql", "utf8"));
    MockPgInstanceSingleton.pgInstance = instance;
    MockPgInstanceSingleton.initialDbState =
      MockPgInstanceSingleton.pgInstance.backup();
    return MockPgInstanceSingleton.pgInstance;
  }

  public static getInstance(): IMemoryDb {
    return MockPgInstanceSingleton.pgInstance ?? new this();
  }

  public static getDbInstance(): db.DBInstance {
    if (!MockPgInstanceSingleton.dbInstance) {
      MockPgInstanceSingleton.dbInstance =
        this.getInstance().adapters.createPgPromise();
    }
    return MockPgInstanceSingleton.dbInstance;
  }

  public static backup(): void {
    MockPgInstanceSingleton.initialDbState =
      MockPgInstanceSingleton.pgInstance.backup();
  }

  public static getInitialState(): IBackup {
    return MockPgInstanceSingleton.initialDbState;
  }
}

const createMockNode = (peerId?: string, hasExitNode?: boolean) =>
  ({
    chain_id: 100,
    id: peerId ?? "peerId" + Math.floor(Math.random() * 100),
    has_exit_node: hasExitNode ?? true,
    hoprd_api_endpoint: "someendpoint",
    hoprd_api_port: 1337,
    honesty_score: 0,
    status: "FRESH",
    total_amount_funded: 0,
    created_at: Date.now().toString(),
    updated_at: Date.now().toString(),
  } as QueryRegisteredNode);

const createMockQuota = (params?: CreateQuota): CreateQuota => {
  return {
    actionTaker: params?.actionTaker ?? "discovery-platform",
    client: params?.client ?? "client",
    quota: params?.quota ?? 1,
  };
};

describe("test db functions", function () {
  let dbInstance: db.DBInstance;

  beforeAll(async function () {
    dbInstance = MockPgInstanceSingleton.getDbInstance();
    MockPgInstanceSingleton.getInitialState();
  });

  beforeEach(async function () {
    MockPgInstanceSingleton.getInitialState().restore();
  });

  it("should save registered node", async function () {
    const node = createMockNode();
    const savedNode = await db.saveRegisteredNode(dbInstance, node);
    if (!savedNode) throw new Error("Db could not save node");
    const dbNode = await db.getRegisteredNode(dbInstance, node.id);
    assert.equal(dbNode?.id, node.id);
  });
  it("should get all registered nodes", async function () {
    await db.saveRegisteredNode(dbInstance, createMockNode("1"));
    await db.saveRegisteredNode(dbInstance, createMockNode("2"));
    const allNodes = await db.getRegisteredNodes(dbInstance);

    assert.equal(allNodes.length, 2);
  });
  it("should get all nodes that are not exit nodes", async function () {
    const firstNode = createMockNode("peer1", false);
    await db.saveRegisteredNode(dbInstance, firstNode);
    const secondNode = createMockNode("peer2", false);
    await db.saveRegisteredNode(dbInstance, secondNode);
    await db.saveRegisteredNode(dbInstance, createMockNode());

    const notExitNodes = await db.getNonExitNodes(dbInstance);

    assert.equal(notExitNodes.length, 2);
  });
  it("should get all nodes that are not exit nodes", async function () {
    const firstNode = createMockNode("peer1", true);
    await db.saveRegisteredNode(dbInstance, firstNode);
    const secondNode = createMockNode("peer2", true);
    await db.saveRegisteredNode(dbInstance, secondNode);
    await db.saveRegisteredNode(dbInstance, createMockNode("peer2", false));

    const exitNodes = await db.getExitNodes(dbInstance);

    assert.equal(exitNodes.length, 2);
  });
  it("should get one registered node", async function () {
    await db.saveRegisteredNode(dbInstance, createMockNode("1"));
    await db.saveRegisteredNode(dbInstance, createMockNode("2"));
    const node = await db.getRegisteredNode(dbInstance, "1");

    assert.equal(node?.id, "1");
  });
  it("should update node", async function () {
    await db.saveRegisteredNode(dbInstance, createMockNode("peer1"));
    const node = await db.getRegisteredNode(dbInstance, "peer1");
    if (!node) throw new Error("Db could not save node");

    await db.updateRegisteredNode(dbInstance, { ...node, status: "UNUSABLE" });
    const updatedNode = await db.getRegisteredNode(dbInstance, "peer1");

    assert.equal(updatedNode?.status, "UNUSABLE");
  });
  it("should create quota", async function () {
    const mockQuota = createMockQuota();
    const quota = await db.createQuota(dbInstance, mockQuota);
    assert.equal(quota.quota, mockQuota.quota);
  });
  it("should get quota by id", async function () {
    const mockQuota = createMockQuota();
    const createdQuota = await db.createQuota(dbInstance, mockQuota);
    await db.createQuota(dbInstance, createMockQuota());
    const queryQuota = await db.getQuota(dbInstance, createdQuota.id ?? 0);
    assert.equal(queryQuota?.quota, mockQuota.quota);
    assert.equal(queryQuota?.action_taker, mockQuota.actionTaker);
  });
  it("should get quotas by client", async function () {
    const mockQuota = createMockQuota({
      client: "client",
      actionTaker: "discovery",
      quota: 10,
    });
    await db.createQuota(dbInstance, mockQuota);
    await db.createQuota(dbInstance, mockQuota);
    await db.createQuota(
      dbInstance,
      createMockQuota({
        actionTaker: "discovery",
        client: "other client",
        quota: 20,
      })
    );

    const quotas = await db.getQuotasByClient(dbInstance, "client");
    assert.equal(quotas.length, 2);
  });
  it("should update quota", async function () {
    const mockQuota = createMockQuota({
      client: "client",
      actionTaker: "discovery",
      quota: 10,
    });
    const createdQuota = await db.createQuota(dbInstance, mockQuota);

    await db.updateQuota(dbInstance, { ...createdQuota, action_taker: "eve" });
    const updatedQuota = await db.getQuota(dbInstance, createdQuota.id ?? 0);
    assert.equal(updatedQuota?.action_taker, "eve");
  });
  it("should delete quota", async function () {
    const mockQuota = createMockQuota({
      client: "client",
      actionTaker: "discovery",
      quota: 10,
    });
    const createdQuota = await db.createQuota(dbInstance, mockQuota);
    if (!createdQuota.id) throw new Error("Could not create mock quota");
    await db.deleteQuota(dbInstance, createdQuota.id);
    const deletedQuota = await db.getQuota(dbInstance, createdQuota.id ?? 0);
    assert.equal(deletedQuota, undefined);
  });
});
