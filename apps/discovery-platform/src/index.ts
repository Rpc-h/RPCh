import { DBInstance } from "./db";
import { entryServer } from "./entry-server";
import { FundingServiceApi } from "./funding-service-api";
import { createLogger } from "./utils";
import pgp from "pg-promise";
import fs from "fs";

const log = createLogger();

const {
  // Port that server will listen for requests
  PORT = 3020,
  // Api endpoint used for completing funding requests of registered nodes
  FUNDING_SERVICE_URL,
  // Access token used to connect to hoprd entry node
  HOPRD_ACCESS_TOKEN,
  // Database connection url
  DB_CONNECTION_URL,
  // Minimal amount of balance a account must have to show commitment
  BALANCE_THRESHOLD = 1,
  // Minimal amount of open channels a account must have to show commitment
  CHANNELS_THRESHOLD = 1,
  // Unit amount of quotas a request costs
  BASE_QUOTA = 1,
} = process.env;

const main = () => {
  if (!HOPRD_ACCESS_TOKEN) {
    throw new Error('Missing "HOPRD_ACCESS_TOKEN" env variable');
  }
  if (!FUNDING_SERVICE_URL)
    throw new Error('Missing "FUNDING_SERVICE_API" env variable');
  if (!DB_CONNECTION_URL) {
    throw new Error('Missing "DB_CONNECTION_URL" env variable');
  }

  // init db
  const pgInstance = pgp();
  const connectionString: string = DB_CONNECTION_URL;
  // create table if the table does not exist
  const dbInstance = pgInstance({
    connectionString,
  });

  start({
    accessToken: HOPRD_ACCESS_TOKEN,
    baseQuota: Number(BASE_QUOTA),
    db: dbInstance,
    fundingServiceUrl: FUNDING_SERVICE_URL,
  });
};

const start = async (ops: {
  db: DBInstance;
  baseQuota: number;
  fundingServiceUrl: string;
  accessToken: string;
}) => {
  // create tables if they do not exist in the db
  const schemaSql = fs.readFileSync("dump.sql", "utf8").toString();
  const existingTables = await ops.db.manyOrNone(
    "SELECT * FROM information_schema.tables WHERE table_name IN ('funding_requests', 'quotas', 'registered_nodes')"
  );
  if (!existingTables.length) {
    await ops.db.none(schemaSql);
  }
  await ops.db.connect();

  // init services
  const fundingServiceApi = new FundingServiceApi(
    ops.fundingServiceUrl,
    ops.db
  );

  const server = entryServer({
    db: ops.db,
    baseQuota: ops.baseQuota,
    accessToken: ops.accessToken,
    fundingServiceApi: fundingServiceApi,
  });
  // start listening at PORT for requests
  server.listen(Number(PORT), "0.0.0.0", () => {
    log.normal("entry server is up");
  });

  // keep track of all pending funding requests to update status or retry
  const checkForPendingRequests = setTimeout(async () => {
    await fundingServiceApi.checkForPendingRequests();
  }, 1000);

  return () => {
    clearInterval(checkForPendingRequests);
  };
};

main();
