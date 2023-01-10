import pgp from "pg-promise";
import { AccessTokenService } from "./access-token";
import { getWallet } from "./blockchain";
import { DBInstance } from "./db";
import * as api from "./entry-server";
import { checkFreshRequests } from "./queue";
import { RequestService } from "./request";
import { createLogger } from "./utils";
import fs from "fs";

const log = createLogger();

const {
  // Secret key used for access token generation
  SECRET_KEY,
  // Wallet private key that will be completing the requests
  WALLET_PRIV_KEY,
  // Postgres db connection url
  DB_CONNECTION_URL,
  // Port that server will listen for requests
  PORT = 3010,
  // Number of confirmations that will be required for a transaction to be accepted
  CONFIRMATIONS = 1,
  // Max amount of tokens a access token can request
  MAX_AMOUNT_OF_TOKENS = 100,
  // Amount of milliseconds that a access token is valid
  TIMEOUT = 30 * 60_000,
} = process.env;

// boolean flag that stops queue from running
// while it is still waiting for a transaction
let running = false;
const handleRunning = (state: boolean) => {
  running = state;
};

const start = async (ops: {
  entryServer: {
    entryServer: typeof api.entryServer;
  };
  db: DBInstance;
  secretKey: string;
  privateKey: string;
  confirmations: number;
}) => {
  // create tables if they do not exist in the db
  const schemaSql = fs.readFileSync("dump.sql", "utf8").toString();
  const existingTables = await ops.db.manyOrNone(
    "SELECT * FROM information_schema.tables WHERE table_name IN ('access_tokens', 'requests')"
  );
  if (!existingTables.length) {
    await ops.db.none(schemaSql);
  }
  await ops.db.connect();
  // init services
  const accessTokenService = new AccessTokenService(ops.db, ops.secretKey);
  const requestService = new RequestService(ops.db);
  const wallet = getWallet(ops.privateKey);
  // init API server
  const app = api.entryServer({
    accessTokenService,
    requestService,
    walletAddress: wallet.address,
    maxAmountOfTokens: Number(MAX_AMOUNT_OF_TOKENS),
    timeout: Number(TIMEOUT),
  });
  // start queue that fulfills requests
  setInterval(() => {
    if (!running) {
      checkFreshRequests({
        requestService: requestService,
        signer: wallet,
        confirmations: ops.confirmations,
        changeState: handleRunning,
      });
    }
  }, 60e3);
  // start listening at PORT for requests
  app.listen(PORT, () => {
    log.normal("entry server is up");
  });
};

const main = () => {
  if (!SECRET_KEY) {
    throw Error("env variable 'SECRET_KEY' not found");
  }
  if (!WALLET_PRIV_KEY) {
    throw Error("env variable 'WALLET_PRIV_KEY' not found");
  }
  if (!DB_CONNECTION_URL) {
    throw Error("env variable 'DB_CONNECTION_URL' not found");
  }
  // init db
  const pgInstance = pgp();
  const connectionString: string = DB_CONNECTION_URL;
  // create table if the table does not exist
  const dbInstance = pgInstance({
    connectionString,
  });

  start({
    entryServer: api,
    db: dbInstance,
    privateKey: WALLET_PRIV_KEY,
    secretKey: SECRET_KEY,
    confirmations: Number(CONFIRMATIONS),
  });
};

main();
