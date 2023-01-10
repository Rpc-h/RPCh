import express from "express";
import { DBInstance } from "../db";
import { FundingServiceApi } from "../funding-service-api";
import { createQuota, getAllQuotasByClient, sumQuotas } from "../quota";
import { CreateQuota } from "../quota/dto";
import {
  createRegisteredNode,
  getExitNodes,
  getNonExitNodes,
  getRegisteredNode,
  getEligibleNode,
  getRewardForNode,
} from "../registered-node";
import { CreateRegisteredNode } from "../registered-node/dto";
import { createLogger } from "../utils";

const app = express();
const apiRouter = express.Router();
const log = createLogger(["entry-server"]);

export const doesClientHaveQuota = async (
  db: DBInstance,
  client: string,
  baseQuota: number
) => {
  const allQuotasFromClient = await getAllQuotasByClient(db, client);
  const sumOfClientsQuota = sumQuotas(allQuotasFromClient);
  return sumOfClientsQuota >= baseQuota;
};

export const entryServer = (ops: {
  db: DBInstance;
  baseQuota: number;
  accessToken: string;
  fundingServiceApi: FundingServiceApi;
}) => {
  app.use("/api", apiRouter);
  apiRouter.use(express.json());

  apiRouter.post("/node/register", async (req, res) => {
    log.verbose("/node/register", req.body);
    const node = req.body as CreateRegisteredNode;
    const registered = await createRegisteredNode(ops.db, node);
    return res.json({ body: registered });
  });

  apiRouter.get("/node", async (req, res) => {
    const { hasExitNode } = req.query;
    if (hasExitNode === "true") {
      const nodes = await getExitNodes(ops.db);
      return res.json(nodes);
    } else {
      const nodes = await getNonExitNodes(ops.db);
      return res.json(nodes);
    }
  });

  apiRouter.get("/node/:peerId", async (req, res) => {
    const { peerId } = req.params;
    const node = await getRegisteredNode(ops.db, peerId as string);
    return res.json({ node });
  });

  apiRouter.get("/funding-service/funds", async (req, res) => {
    const funds = await ops.fundingServiceApi.getAvailableFunds();
    return res.json({ body: funds });
  });

  apiRouter.post("/client/funds", async (req, res) => {
    const { client, quota } = req.body as CreateQuota;
    const createdQuota = await createQuota(ops.db, {
      client,
      quota,
      actionTaker: "discovery platform",
    });
    return res.json({ quota: createdQuota });
  });

  apiRouter.post("/request/entry-node", async (req, res) => {
    const { client } = req.body;
    log.verbose("requesting entry node for client", client);
    if (typeof client !== "string") throw Error("Client is not a string");

    // check if client has enough quota
    const doesClientHaveQuotaResponse = await doesClientHaveQuota(
      ops.db,
      client,
      ops.baseQuota
    );
    // TODO: reenable
    if (false && !doesClientHaveQuotaResponse) {
      return res.status(400).json({
        body: "Client does not have enough quota",
      });
    }
    // choose selected entry node
    const selectedNode = await getEligibleNode(ops.db);
    log.verbose("selected entry node", selectedNode);
    if (!selectedNode) {
      return res.json({ body: "Could not find eligible node" });
    }

    // calculate how much should be funded to entry node
    const amountToFund = getRewardForNode(ops.baseQuota, selectedNode);
    // fund entry node
    await ops.fundingServiceApi.requestFunds(amountToFund, selectedNode);

    // create negative quota (showing that the client has used up initial quota)
    await createQuota(ops.db, {
      client,
      quota: ops.baseQuota * -1,
      actionTaker: "discovery platform",
    });
    return res.json({ ...selectedNode, accessToken: ops.accessToken });
  });

  return app;
};
