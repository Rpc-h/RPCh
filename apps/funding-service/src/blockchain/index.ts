import { ethers, Signer, Wallet, Contract } from "ethers";
import { createLogger, validChainIds } from "../utils";
import * as erc20 from "./erc20-fixture.json";

const log = createLogger(["blockchain"]);

/**
 * Blockchain functions, anything to do with interactions on chain is handled here
 */

/**
 * Transfer tokens on a given smart contract address
 * @param smartContractAddress string
 * @param from ethers Signer who will transfer the tokens
 * @param to address of who will receive the tokens
 * @param amount string
 * @returns transactionResponse
 */
export const sendTransaction = async (params: {
  smartContractAddress: string;
  from: Signer;
  to: string;
  amount: string;
}): Promise<ethers.providers.TransactionResponse> => {
  const contract = new Contract(
    params.smartContractAddress,
    erc20.abi,
    params.from
  );

  const txParams = [params.to, params.amount];

  const transactionResponse = await contract.transfer(...txParams);

  return transactionResponse;
};

/**
 * Get provider from the providers map in utils with a given chain id
 * @param chainId number
 */
export const getProvider = async (chainId: number) => {
  if (!validChainIds.has(chainId)) throw new Error("Chain not supported");
  const provider = new ethers.providers.JsonRpcProvider(
    validChainIds.get(chainId)?.url
  );
  return provider;
};

/**
 * Get providers from the providers map in utils from given chainIds
 * @param chainIds number[]
 */
export const getProviders = async (chainIds: number[]) => {
  log.verbose("fetching providers", chainIds);
  const providers = [];
  for (const chainId of chainIds) {
    const provider = await getProvider(chainId);
    await provider.ready;
    providers.push(provider);
    log.verbose("found provider", JSON.stringify(provider));
  }
  return providers;
};

/**
 * Create a ethers wallet from a private key and provider
 * @param privateKey string
 * @param provider ethers JsonRpcProvider
 * @returns ethers Wallet
 */
export const getWallet = (
  privateKey: string,
  provider?: ethers.providers.JsonRpcProvider
): ethers.Wallet => {
  let wallet = new Wallet(privateKey);
  if (provider) {
    wallet = wallet.connect(provider);
  }
  return wallet;
};

/**
 * Get balance of a wallet on a smart contract (ERC-20)
 * @param smartContractAddress string
 * @param walletAddress string
 * @param provider ethers Provider
 * @returns number
 */
export const getBalance = (
  smartContractAddress: string,
  walletAddress: string,
  provider: ethers.providers.Provider
) => {
  const contract = new ethers.Contract(
    smartContractAddress,
    erc20.abi,
    provider
  );
  const balance = contract.balanceOf(walletAddress);
  return balance;
};

/**
 * Gets balance for a wallet on all chains passed as parameters
 * @param smartContractAddresses object with chainId as key and smart contact address as value
 * @param walletAddress string
 * @param providers array of ethers JsonRpcProviders
 * @returns object [chainId: number]: number
 */
export const getBalanceForAllChains = async (
  smartContractAddresses: { [chainId: number]: string },
  walletAddress: string,
  providers: ethers.providers.JsonRpcProvider[]
) => {
  const balances: { [chainId: number]: number } = {};
  for (const provider of providers) {
    log.verbose(["fetching balance for provider", provider.connection.url]);
    const balance = await getBalance(
      smartContractAddresses[provider.network.chainId],
      walletAddress,
      provider
    );
    balances[provider.network.chainId] = Number(balance.toString());
  }
  return balances;
};

/**
 * Gets receipt of transaction hash
 * @param provider ethers Provider
 * @param transactionHash hash that the transaction returned
 * @returns ethers TransactionReceipt
 */
export const getReceiptOfTransaction = async (
  provider: ethers.providers.JsonRpcProvider,
  transactionHash: string
) => {
  const receipt = await provider.getTransactionReceipt(transactionHash);
  return receipt;
};

/**
 * Waits for transaction to get a specific amount of confirmations
 * @param transactionHash hash that the transaction returned
 * @param provider ethers Provider
 * @param confirmations number
 * @returns Promise ethers TransactionReceipt
 */
export const waitForTransaction = (
  transactionHash: string,
  provider: ethers.providers.Provider,
  confirmations: number
): Promise<ethers.providers.TransactionReceipt> => {
  return provider.waitForTransaction(transactionHash, confirmations);
};
