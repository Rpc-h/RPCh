import { CreateQuota, QueryQuota } from "../quota/dto";
import type { QueryRegisteredNode } from "../registered-node/dto";
import pgp from "pg-promise";
import { createLogger } from "../utils";

export type DBInstance = pgp.IDatabase<{}>;

const log = createLogger(["db"]);

const TABLES = {
  REGISTERED_NODES: "registered_nodes",
  FUNDING_REQUESTS: "funding_requests",
  QUOTAS: "quotas",
};

export const getRegisteredNodes = async (
  dbInstance: DBInstance
): Promise<QueryRegisteredNode[]> => {
  const text = `SELECT * FROM ${TABLES.REGISTERED_NODES}`;
  const dbRes = (await dbInstance.manyOrNone(text)) as QueryRegisteredNode[];
  return dbRes;
};

export const getExitNodes = async (
  dbInstance: DBInstance
): Promise<QueryRegisteredNode[]> => {
  const text = `SELECT * FROM ${TABLES.REGISTERED_NODES} WHERE has_exit_node=true`;
  const dbRes = (await dbInstance.manyOrNone(text)) as QueryRegisteredNode[];
  return dbRes;
};

export const getNonExitNodes = async (
  dbInstance: DBInstance
): Promise<QueryRegisteredNode[]> => {
  const text = `SELECT * FROM ${TABLES.REGISTERED_NODES} WHERE has_exit_node=false`;
  const dbRes = (await dbInstance.manyOrNone(text)) as QueryRegisteredNode[];
  return dbRes;
};

export const saveRegisteredNode = async (
  dbInstance: DBInstance,
  node: Omit<QueryRegisteredNode, "created_at" | "updated_at">
): Promise<boolean> => {
  try {
    const text = `INSERT INTO 
    ${TABLES.REGISTERED_NODES} (has_exit_node, id, chain_id, hoprd_api_endpoint, hoprd_api_port, exit_node_pub_key, total_amount_funded, honesty_score, status)
    VALUES ($<has_exit_node>, $<id>, $<chain_id>, $<hoprd_api_endpoint>, $<hoprd_api_port>, $<exit_node_pub_key>, $<total_amount_funded>, $<honesty_score>, $<status>)
    RETURNING *`;
    const values: Omit<QueryRegisteredNode, "created_at" | "updated_at"> = {
      has_exit_node: node.has_exit_node,
      id: node.id,
      chain_id: node.chain_id,
      hoprd_api_endpoint: node.hoprd_api_endpoint,
      hoprd_api_port: node.hoprd_api_port,
      exit_node_pub_key: node.exit_node_pub_key,
      total_amount_funded: node.total_amount_funded,
      honesty_score: node.honesty_score,
      status: node.status,
    };
    const dbRes = await dbInstance.one<QueryRegisteredNode>(text, values);
    log.verbose("Response from DB", dbRes);
    return dbRes ? true : false;
  } catch (e) {
    log.error(e);
    return false;
  }
};

export const getRegisteredNode = async (
  dbInstance: DBInstance,
  peerId: string
): Promise<QueryRegisteredNode | null> => {
  const text = `SELECT * FROM ${TABLES.REGISTERED_NODES} WHERE id=$<peerId>`;
  const values = {
    peerId,
  };
  const dbRes = (await dbInstance.oneOrNone(
    text,
    values
  )) as QueryRegisteredNode;
  return dbRes;
};

export const updateRegisteredNode = async (
  dbInstance: DBInstance,
  updatedNode: QueryRegisteredNode
): Promise<boolean> => {
  try {
    const text = `UPDATE ${TABLES.REGISTERED_NODES}
    SET has_exit_node = $<has_exit_node>, chain_id = $<chain_id>, 
    total_amount_funded = $<total_amount_funded>, honesty_score = $<honesty_score>, 
    reason = $<reason>, status = $<status>
    WHERE id = $<id>
    RETURNING *`;
    const values = {
      id: updatedNode.id,
      has_exit_node: updatedNode.has_exit_node,
      chain_id: updatedNode.chain_id,
      total_amount_funded: updatedNode.total_amount_funded,
      honesty_score: updatedNode.honesty_score,
      reason: updatedNode.reason,
      status: updatedNode.status,
    };
    const dbRes = (await dbInstance.one(text, values)) as QueryRegisteredNode;
    return dbRes ? true : false;
  } catch (e) {
    log.error(e);
    return false;
  }
};

export const createQuota = async (
  dbInstance: DBInstance,
  quota: CreateQuota
): Promise<QueryQuota> => {
  const text = `INSERT INTO ${TABLES.QUOTAS} (id, client, quota, action_taker)
  VALUES (default, $<client>, $<quota>, $<action_taker>) RETURNING *`;
  const values = {
    client: quota.client,
    quota: quota.quota,
    action_taker: quota.actionTaker,
  };

  const dbRes = (await dbInstance.one(text, values)) as QueryQuota;
  return dbRes;
};

export const getQuota = async (
  dbInstance: DBInstance,
  id: number
): Promise<QueryQuota | undefined> => {
  const text = `SELECT * FROM ${TABLES.QUOTAS} WHERE id=$<id>`;
  const values = {
    id,
  };
  const dbRes = (await dbInstance.oneOrNone(text, values)) as QueryQuota;
  return dbRes;
};

export const getQuotasByClient = async (
  dbInstance: DBInstance,
  client: string
): Promise<QueryQuota[]> => {
  const text = `SELECT * FROM ${TABLES.QUOTAS} WHERE client=$<client>`;
  const values = {
    client,
  };
  const dbRes = (await dbInstance.manyOrNone(text, values)) as QueryQuota[];
  return dbRes;
};

export const updateQuota = async (
  dbInstance: DBInstance,
  quota: QueryQuota
): Promise<QueryQuota> => {
  const text = `UPDATE ${TABLES.QUOTAS}
  SET client = $<client>, quota = $<quota>, action_taker = $<action_taker>
  WHERE id = $<id> 
  RETURNING *`;
  const values = {
    id: quota.id,
    client: quota.client,
    action_taker: quota.action_taker,
    quota: quota.quota,
  };
  const dbRes = (await dbInstance.oneOrNone(text, values)) as QueryQuota;
  return dbRes;
};

export const deleteQuota = async (
  dbInstance: DBInstance,
  id: number
): Promise<QueryQuota | undefined> => {
  const text = `DELETE FROM ${TABLES.QUOTAS} WHERE id=$<id> RETURNING *`;
  const values = {
    id,
  };
  const dbRes = (await dbInstance.oneOrNone(text, values)) as QueryQuota;
  return dbRes;
};
