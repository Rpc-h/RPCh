import { Pool } from "pg";
import { DBInstance /* updateRegisteredNode */ } from "./db";
import { entryServer } from "./entry-server";
import { createLogger } from "./utils";
import pgp from "pg-promise";
// import { checkCommitmentForFreshNodes } from "./registered-node";
// import { checkCommitment, getChannelsFromGraph } from "./graph-api";
import * as constants from "./constants";
import * as Prometheus from "prom-client";
import { MetricManager } from "@rpch/common/build/internal/metric-manager";
import { runMigrations } from "@rpch/common/build/internal/db";
// import * as async from "async";
import path from "path";
import migrate from "node-pg-migrate";

import type { Secrets } from "./secrets";
// import type { RegisteredNodeDB, AvailabilityMonitorResult } from "./types";

const log = createLogger();

const start = async (ops: {
  db: DBInstance;
  dbPool: Pool;
  baseQuota: bigint;
  port: number;
  secrets: Secrets;
  url: string;
  availabilityMonitorUrl?: string;
}) => {
  // let availabilityMonitorResults = new Map<string, AvailabilityMonitorResult>();
  const availabilityMonitorResults = new Map();

  // run db migrations
  const migrationsDirectory = path.join(__dirname, "../migrations");
  await runMigrations(
    constants.DB_CONNECTION_URL!,
    migrationsDirectory,
    migrate
  );

  // create prometheus registry
  const register = new Prometheus.Registry();

  // add default metrics to registry
  Prometheus.collectDefaultMetrics({ register });

  const metricManager = new MetricManager(
    Prometheus,
    register,
    constants.METRIC_PREFIX
  );

  const app = entryServer({
    db: ops.db,
    dbPool: ops.dbPool,
    baseQuota: ops.baseQuota,
    metricManager: metricManager,
    secrets: ops.secrets,
    url: ops.url,
    getAvailabilityMonitorResults: () => availabilityMonitorResults,
  });

  // start listening at PORT for requests
  const host = "0.0.0.0";
  /* const server = */ app.listen(ops.port, host, () => {
    log.normal(`entry server running on ${host}:${ops.port}`);
  });

  // set server timeout to 30s
  // server.setTimeout(30e3);

  // Create a task queue with a concurrency limit of QUEUE_CONCURRENCY_LIMIT
  // to process nodes in parallel for commitment check
  //   const queueCheckCommitment = async.queue(
  //     async (task: RegisteredNodeDB, callback) => {
  //       try {
  //         const channels = await getChannelsFromGraph(task.id);
  //         const nodeIsCommitted = await checkCommitment({
  //           channels,
  //           node: task,
  //           minBalance: constants.BALANCE_THRESHOLD,
  //           minChannels: constants.CHANNELS_THRESHOLD,
  //         });
  //
  //         if (nodeIsCommitted) {
  //           await updateRegisteredNode(ops.db, {
  //             ...task,
  //             status: "READY",
  //           });
  //         }
  //
  //         callback();
  //       } catch (e) {}
  //     },
  //     constants.QUEUE_CONCURRENCY_LIMIT
  //   );
  //
  // adds fresh node to queue
  // const checkCommitmentInterval = setInterval(
  //   () =>
  //     checkCommitmentForFreshNodes(
  //       ops.db,
  //       queueCheckCommitment,
  //       (node, err) => {
  //         if (err) {
  //           log.error("Failed to process node", node, err);
  //         }
  //       }
  //     ),
  //   60e3
  // );

  // fetch and cache availability monitor results
  // const updateAvailabilityMonitorResultsInterval = setInterval(async () => {
  //   try {
  //     if (!ops.availabilityMonitorUrl) return;
  //     const response = await fetch(
  //       `${ops.availabilityMonitorUrl}/api/nodes`
  //     ).then(
  //       (res) => res.json() as unknown as [string, AvailabilityMonitorResult][]
  //     );
  //     availabilityMonitorResults = new Map(response);
  //     log.verbose(
  //       "Updated availability monitor results with size %i",
  //       availabilityMonitorResults.size
  //     );
  //   } catch (error) {
  //     log.error("Error fetching availability monitor results", error);
  //   }
  // }, 1000);

  return () => {
    // clearInterval(checkCommitmentInterval);
    // clearInterval(updateAvailabilityMonitorResultsInterval);
  };
};

const main = () => {
  // postgres url
  if (!process.env.DB_CONNECTION_URL) {
    throw new Error("Missing 'DB_CONNECTION_URL' env var.");
  }
  // server port
  if (!process.env.PORT) {
    throw new Error("Missing 'PORT' env var.");
  }
  // admin secret
  if (!process.env.SECRET) {
    throw new Error("Missing 'SECRET' env var.");
  }
  // cookie secret
  if (!process.env.SESSION_SECRET) {
    throw new Error("Missing 'SESSION_SECRET' env var.");
  }
  // google oauth
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("Missing 'GOOGLE_CLIENT_ID' env var.");
  }
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing 'GOOGLE_CLIENT_SECRET' env var.");
  }
  if (!process.env.URL) {
    throw new Error("Missing 'URL' env var.");
  }

  // init db
  const connectionString = process.env.DB_CONNECTION_URL;
  const dbPool = new Pool({ connectionString });
  const dbInst = pgp()({ connectionString });

  const secrets = {
    adminSecret: process.env.SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    googleClientID: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };

  start({
    baseQuota: constants.BASE_QUOTA,
    db: dbInst,
    dbPool,
    port: parseInt(process.env.PORT, 10),
    secrets,
    url: process.env.URL,
    availabilityMonitorUrl: constants.AVAILABILITY_MONITOR_URL,
  });
};

// if this file is the entrypoint of the nodejs process
if (require.main === module) {
  main();
}
