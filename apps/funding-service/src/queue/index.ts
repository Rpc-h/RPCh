import { BigNumber, ethers, Signer } from "ethers";
import {
  getBalance,
  getProvider,
  sendTransaction,
  waitForTransaction,
} from "../blockchain";
import { QueryRequest, RequestService } from "../request";
import { CustomError, smartContractAddresses, createLogger } from "../utils";

const log = createLogger(["queue"]);

/**
 * Scans through all requests and fulfills the oldest fresh request
 * @param requestService
 * @param signer ethers signer that will send the transaction
 * @param confirmations amount of confirmations to wait for every transaction
 * @param changeState updates a higher lever boolean that stops this function from running
 * while it is already running
 */
export const checkFreshRequests = async (ops: {
  requestService: RequestService;
  signer: Signer;
  confirmations: number;
  changeState: (state: boolean) => void;
}) => {
  ops.changeState(true);
  let freshRequest: QueryRequest | undefined;
  try {
    freshRequest = await ops.requestService.getOldestFreshRequest();
    if (!freshRequest) throw new CustomError("No pending fresh request");
    log.normal(
      "handling request: ",
      freshRequest.id,
      log.createMetric({ id: freshRequest.id })
    );
    // check if request and signer are valid
    if (!ops.signer) throw new CustomError("Missing signer transaction");
    if (!freshRequest.chain_id)
      throw new CustomError("Request is missing chainId");
    // check if signer has enough to fund request
    const provider = ops.signer.provider
      ? ops.signer.provider
      : await getProvider(freshRequest.chain_id);
    let connectedSigner = ops.signer.provider
      ? ops.signer
      : ops.signer.connect(provider);
    let address = await connectedSigner.getAddress();
    const balance = await getBalance(
      smartContractAddresses?.[
        freshRequest.chain_id as keyof typeof smartContractAddresses
      ],
      address,
      provider
    );
    if (balance < BigNumber.from(freshRequest.amount))
      throw new CustomError(
        "Signer does not have enough balance to fund request"
      );
    // set request status to pending while it is on the wire
    await ops.requestService.updateRequest(freshRequest.id, {
      status: "PENDING",
      accessTokenHash: freshRequest.access_token_hash,
      nodeAddress: freshRequest.node_address,
      chainId: freshRequest.chain_id,
      amount: freshRequest.amount,
      id: freshRequest.id,
    });
    // sent transaction to fund request
    const { hash: txHash } = await sendTransaction({
      smartContractAddress:
        smartContractAddresses?.[
          freshRequest.chain_id as keyof typeof smartContractAddresses
        ],
      from: connectedSigner,
      to: freshRequest?.node_address,
      amount: ethers.utils.parseEther(freshRequest.amount).toString(),
    });
    // set request status to pending while it is confirmed or failed
    await ops.requestService.updateRequest(freshRequest.id, {
      transactionHash: txHash,
      status: "PENDING",
      accessTokenHash: freshRequest.access_token_hash,
      nodeAddress: freshRequest.node_address,
      chainId: freshRequest.chain_id,
      amount: freshRequest.amount,
      id: freshRequest.id,
    });
    // wait for transaction to reach a certain amount of confirmations
    const txReceipt = await waitForTransaction(
      txHash,
      provider,
      ops.confirmations
    );
    // update request to success or failed
    await ops.requestService.updateRequest(freshRequest.id, {
      status: txReceipt.status === 1 ? "SUCCESS" : "FAILED",
      transactionHash: txHash,
      accessTokenHash: freshRequest.access_token_hash,
      nodeAddress: freshRequest.node_address,
      chainId: freshRequest.chain_id,
      amount: freshRequest.amount,
      id: freshRequest.id,
    });
  } catch (e: any) {
    log.error(e);
    if (freshRequest) {
      // check if request was rejected
      if (e instanceof CustomError) {
        // update request to rejected and why
        await ops.requestService.updateRequest(freshRequest?.id, {
          status: "REJECTED-DURING-PROCESSING",
          reason: e.message,
          accessTokenHash: freshRequest.access_token_hash,
          nodeAddress: freshRequest.node_address,
          chainId: freshRequest.chain_id,
          amount: freshRequest.amount,
          id: freshRequest.id,
        });
      } else {
        // update request to failed during processing and save the reason it unexpectedly failed
        await ops.requestService.updateRequest(freshRequest?.id, {
          status: "FAILED-DURING-PROCESSING",
          reason: e.message ?? JSON.stringify(e),
          accessTokenHash: freshRequest.access_token_hash,
          nodeAddress: freshRequest.node_address,
          chainId: freshRequest.chain_id,
          amount: freshRequest.amount,
          id: freshRequest.id,
        });
      }
    }
  } finally {
    ops.changeState(false);
  }
};
