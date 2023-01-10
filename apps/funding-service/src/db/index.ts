import { CreateAccessToken, QueryAccessToken } from "../access-token";
import { CreateRequest, QueryRequest, UpdateRequest } from "../request";
import pgp from "pg-promise";
import { createLogger } from "../utils";

/**
 * DB module that handles the formatting of queries and executing them
 */

const log = createLogger(["db"]);

export type DBInstance = pgp.IDatabase<{}>;

export const saveAccessToken = async (
  db: DBInstance,
  accessToken: CreateAccessToken
): Promise<QueryAccessToken> => {
  const text =
    "INSERT INTO access_tokens(id, token, expired_at) values(default, $<token>, $<expiredAt>) RETURNING *";
  const values = {
    token: accessToken.token,
    expiredAt: accessToken.expiredAt,
  };
  const dbRes = (await db.one(text, values)) as QueryAccessToken;
  return dbRes;
};

export const getAccessToken = async (
  db: DBInstance,
  accessTokenHash: string
): Promise<QueryAccessToken | undefined> => {
  const text = "SELECT * FROM access_tokens WHERE token=$<token>";
  const values = {
    token: accessTokenHash,
  };
  const dbRes = (await db.oneOrNone(text, values)) as QueryAccessToken;

  return dbRes;
};

export const deleteAccessToken = async (
  db: DBInstance,
  accessTokenHash: string
): Promise<QueryAccessToken> => {
  const text = "DELETE FROM access_tokens WHERE token=$<token> RETURNING *";
  const values = {
    token: accessTokenHash,
  };
  const dbRes = await db.oneOrNone(text, values);
  return dbRes;
};

export const saveRequest = async (
  db: DBInstance,
  request: CreateRequest
): Promise<QueryRequest> => {
  const text = `INSERT INTO requests(id, access_token_hash, node_address, amount, chain_id, status)
    values(default, $<token>, $<address>, $<amount>, $<chainId>, $<status>)
    RETURNING *`;
  const values = {
    token: request.accessTokenHash,
    address: request.nodeAddress,
    amount: request.amount,
    chainId: request.chainId,
    status: request.status,
  };
  const dbRes = (await db.one(text, values)) as QueryRequest;
  return dbRes;
};

export const getRequest = async (
  db: DBInstance,
  requestId: number
): Promise<QueryRequest> => {
  const text = "SELECT * FROM requests WHERE id=$<id>";
  const values = {
    id: requestId,
  };
  const dbRes = (await db.oneOrNone(text, values)) as QueryRequest;

  return dbRes;
};

export const getRequests = async (db: DBInstance): Promise<QueryRequest[]> => {
  const text = "SELECT * FROM requests";
  const dbRes = (await db.manyOrNone(text)) as QueryRequest[];
  return dbRes;
};

export const getRequestsByAccessToken = async (
  db: DBInstance,
  accessTokenHash: string
): Promise<QueryRequest[]> => {
  const text = "SELECT * FROM requests WHERE access_token_hash=$<token>";
  const values = {
    token: accessTokenHash,
  };
  const dbRes = (await db.manyOrNone(text, values)) as QueryRequest[];

  return dbRes;
};

export const updateRequest = async (
  db: DBInstance,
  request: UpdateRequest
): Promise<QueryRequest> => {
  const text = `UPDATE requests SET 
    access_token_hash=$<accessTokenHash>,
    node_address=$<nodeAddress>,
    amount=$<amount>,
    chain_id=$<chainId>,
    reason=$<reason>,
    transaction_hash=$<transactionHash>,
    status=$<status>
    WHERE id=$<id>`;
  const values = {
    id: request.id,
    accessTokenHash: request.accessTokenHash,
    nodeAddress: request.nodeAddress,
    amount: request.amount,
    chainId: request.chainId,
    reason: request.reason,
    transactionHash: request.transactionHash,
    status: request.status,
  } as UpdateRequest;

  const dbRes = (await db.oneOrNone(text, values)) as QueryRequest;

  return dbRes;
};

export const deleteRequest = async (
  db: DBInstance,
  requestId: number
): Promise<QueryRequest> => {
  const text = "DELETE FROM requests WHERE id=$<id> RETURNING *";
  const values = {
    id: requestId,
  };
  const dbRes = await db.oneOrNone(text, values);
  return dbRes;
};

export const getOldestFreshRequest = async (
  db: DBInstance
): Promise<QueryRequest> => {
  const text = `SELECT * FROM requests
    WHERE status = 'FRESH'
    ORDER BY created_at ASC
    LIMIT 1;`;
  const dbRes = (await db.oneOrNone(text)) as QueryRequest;
  return dbRes;
};

export const getAllUnresolvedRequests = async (
  db: DBInstance
): Promise<QueryRequest[]> => {
  const text = `SELECT * FROM requests
    WHERE status IN ('FRESH', 'PROCESSING')`;
  const dbRes = (await db.manyOrNone(text)) as QueryRequest[];
  return dbRes;
};
