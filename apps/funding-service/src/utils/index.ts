import { ethers } from "ethers";
import { utils } from "@rpch/common";

export const createLogger = utils.LoggerFactory("funding-service");

export const isExpired = (expireAt: string) => {
  if ((new Date(expireAt).valueOf() ?? 0) < new Date(Date.now()).valueOf()) {
    return true;
  }
  return false;
};

export const hardhatChainId = 31337;

export const gnosisChainId = 100;

export const sandboxChainId = 1;

const productionConnectionInfo: [number, ethers.utils.ConnectionInfo][] = [
  [gnosisChainId, { url: "https://rpc.gnosischain.com/" }],
];

const developmentConnectionInfo: [number, ethers.utils.ConnectionInfo][] = [
  [sandboxChainId, { url: "http://sandbox-nodes-pluto-1:8545" }],
];

export type ValidConnectionInfo = Map<number, ethers.utils.ConnectionInfo>;

export const validChainIds: ValidConnectionInfo = new Map<
  number,
  ethers.utils.ConnectionInfo
>(
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.NODE_ENV === "production"
    ? productionConnectionInfo
    : developmentConnectionInfo
);

export const smartContractAddresses = {
  [gnosisChainId]: "0x66225dE86Cac02b32f34992eb3410F59DE416698",
  [hardhatChainId]:
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.SMART_CONTRACT_ADDRESS ??
    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  [sandboxChainId]:
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.SMART_CONTRACT_ADDRESS ??
    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
};

export class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomError";
  }
}
