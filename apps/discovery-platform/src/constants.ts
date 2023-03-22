import { RegisteredNodeDB } from "./types";

const {
  // Api endpoint used for completing funding requests of registered nodes
  FUNDING_SERVICE_URL,
  // Database connection url
  DB_CONNECTION_URL,
} = process.env;

// Skips commitment check making all fresh nodes go to ready
const SKIP_CHECK_COMMITMENT = process.env.SKIP_CHECK_COMMITMENT === "true";

// Unit amount of quotas a request costs
const BASE_QUOTA = process.env.BASE_QUOTA
  ? BigInt(process.env.BASE_QUOTA)
  : BigInt(10e3);

// Port that server will listen for requests
const PORT = process.env.PORT ? Number(process.env.PORT) : 3020;

// Minimal amount of balance a account must have to show commitment
const BALANCE_THRESHOLD = process.env.BALANCE_THRESHOLD
  ? Number(process.env.BALANCE_THRESHOLD)
  : 1;

// Minimal amount of open channels a account must have to show commitment
const CHANNELS_THRESHOLD = process.env.CHANNELS_THRESHOLD
  ? Number(process.env.CHANNELS_THRESHOLD)
  : 1;

// Subgraph endpoint used to query node commitment
const SUBGRAPH_URL =
  "https://api.thegraph.com/subgraphs/name/hoprnet/hopr-channels";

// base amount of reward that a node will receive after completing a request
const BASE_EXTRA = BigInt(1);

// payment mode when quota is paid by trial client
const TRIAL_PAYMENT_MODE = "trial";

// client id that will pay for quotas in trial mode
const TRIAL_CLIENT_ID = "trial";

// Max amount of connections app will have with db
const MAX_DB_CONNECTIONS = 18;

// array that contains a list of capabilities for DP using HOPRD token capabilities
const DP_HOPRD_TOKEN_CAPABILITIES = [
  "tokensCreate",
  "tokensGetToken",
  "tokensDelete",
];

// array that contains a list of capabilities for regular users using HOPRD token capabilities
const USER_HOPRD_TOKEN_CAPABILITIES = [
  "messagesWebsocket",
  "messagesSendMessage",
  "tokensGetToken",
];

// Used to create
const AMOUNT_OF_RANDOM_WORDS_FOR_TRIAL_ID = 5;

// Name of db tables in schema
const DB_TABLES = {
  REGISTERED_NODES: "registered_nodes",
  FUNDING_REQUESTS: "funding_requests",
  QUOTAS: "quotas",
  CLIENTS: "clients",
};

// Values that will be used to query db
const DB_QUERY_VALUES: {
  REGISTERED_NODES_WITHOUT_API_TOKEN: (keyof Omit<
    RegisteredNodeDB,
    "hoprd_api_token"
  >)[];
  REGISTERED_NODES: (keyof RegisteredNodeDB)[];
} = {
  REGISTERED_NODES_WITHOUT_API_TOKEN: [
    "id",
    "has_exit_node",
    "chain_id",
    "hoprd_api_endpoint",
    "exit_node_pub_key",
    "native_address",
    "total_amount_funded",
    "honesty_score",
    "reason",
    "status",
    "created_at",
    "updated_at",
  ],
  REGISTERED_NODES: [
    "id",
    "has_exit_node",
    "chain_id",
    "hoprd_api_endpoint",
    "hoprd_api_token",
    "exit_node_pub_key",
    "native_address",
    "total_amount_funded",
    "honesty_score",
    "reason",
    "status",
    "created_at",
    "updated_at",
  ],
};

export {
  PORT,
  FUNDING_SERVICE_URL,
  DB_CONNECTION_URL,
  BALANCE_THRESHOLD,
  CHANNELS_THRESHOLD,
  BASE_QUOTA,
  BASE_EXTRA,
  SUBGRAPH_URL,
  SKIP_CHECK_COMMITMENT,
  MAX_DB_CONNECTIONS,
  AMOUNT_OF_RANDOM_WORDS_FOR_TRIAL_ID,
  DP_HOPRD_TOKEN_CAPABILITIES,
  USER_HOPRD_TOKEN_CAPABILITIES,
  DB_TABLES,
  DB_QUERY_VALUES,
  TRIAL_PAYMENT_MODE,
  TRIAL_CLIENT_ID,
};
