import { JsonRpcProvider } from "@ethersproject/providers";
import { expect } from "chai";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import assert from "assert";
import { Contract, Signer, Wallet } from "ethers";
import { ethers } from "hardhat";
import {
  getBalance,
  getBalanceForAllChains,
  getProvider,
  getReceiptOfTransaction,
  getWallet,
  sendTransaction,
  waitForTransaction,
} from ".";
import * as erc20 from "./erc20-fixture.json";

const INITIAL_AMOUNT = ethers.utils.parseEther("1000").toBigInt();
const TOKEN_NAME = "CUSTOM TOKEN";
const DECIMAL_UNITS = "18";
const TOKEN_SYMBOL = "TKN";

describe("test Blockchain class", function () {
  let accounts: SignerWithAddress[];
  let provider: JsonRpcProvider;
  let contract: Contract;
  beforeEach(async function () {
    accounts = await ethers.getSigners();
    provider = ethers.provider;
    const contractFactory = new ethers.ContractFactory(
      erc20.abi,
      erc20.byteCode
    ).connect(accounts[0]);
    contract = await contractFactory.deploy(
      INITIAL_AMOUNT,
      TOKEN_NAME,
      DECIMAL_UNITS,
      TOKEN_SYMBOL
    );
    await contract.deployed();
  });

  it("should get balance", async function () {
    const [owner] = accounts;
    const balance = await getBalance(contract.address, owner.address, provider);
    assert.equal(balance.toString(), INITIAL_AMOUNT);
  });
  it("should send transaction and receive transaction response", async () => {
    const [owner, receiver] = accounts;
    const transactionHash = await sendTransaction({
      smartContractAddress: contract.address,
      from: owner,
      to: receiver.address,
      amount: ethers.utils.parseEther("10").toBigInt(),
    });
    assert.notEqual(transactionHash, undefined);
  });
  it("should check the status of transaction", async function () {
    const [owner, receiver] = accounts;
    const { hash: transactionHash } = await sendTransaction({
      smartContractAddress: contract.address,
      from: owner,
      to: receiver.address,
      amount: BigInt("10"),
    });
    const receipt = await getReceiptOfTransaction(provider, transactionHash);
    const possibleStatus = [0, 1];
    expect(possibleStatus).includes(receipt.status);
  });
  it("should return a signer instance when passing a private key", async function () {
    const privKey = Wallet.createRandom().privateKey;
    const wallet = getWallet(privKey, provider);
    assert(wallet instanceof Signer);
  });
  it("should fail if chain is not supported", async function () {
    try {
      await getProvider(-1);
    } catch (e: any) {
      expect(e.message).to.eq("Chain not supported");
    }
  });
  it("should wait for transaction to be confirmed", async function () {
    const [owner, receiver] = accounts;
    const confirmations = 10;
    const { hash: transactionHash } = await sendTransaction({
      smartContractAddress: contract.address,
      from: owner,
      to: receiver.address,
      amount: BigInt("10"),
    });
    const [receipt] = await Promise.all([
      waitForTransaction(transactionHash, provider, confirmations),
      mine(confirmations),
    ]);
    assert.equal(receipt.confirmations, confirmations + 1);
  });
  it("should fail because of because user does not have enough funds", async function () {
    const [owner, receiver] = accounts;
    await sendTransaction({
      smartContractAddress: contract.address,
      from: owner,
      to: receiver.address,
      amount: INITIAL_AMOUNT,
    });
    await expect(
      sendTransaction({
        smartContractAddress: contract.address,
        from: owner,
        to: receiver.address,
        amount: INITIAL_AMOUNT,
      })
    ).to.be.reverted;
  });
  it("should get balances keyed by chain", async function () {
    const [owner] = accounts;
    const balance = await getBalance(contract.address, owner.address, provider);
    const keyedBalance = await getBalanceForAllChains(
      { [provider.network.chainId]: contract.address },
      owner.address,
      [provider]
    );

    assert.equal(keyedBalance[provider.network.chainId], balance.toString());
  });
  // TODO: Add tests for smart contract reverts
  it.todo("should fail if smart contract is reverted");
});
