import express from "express";
import { AccessTokenService } from "../access-token";
import { getBalanceForAllChains, getProviders } from "../blockchain";
import { RequestService } from "../request";
import { createLogger, smartContractAddresses, validChainIds } from "../utils";
import { tokenIsValid } from "./middleware";
import { body, validationResult, param } from "express-validator";

const app = express();
const log = createLogger(["entry-server"]);

/**
 * Express server that holds all routes
 * @param accessTokenService
 * @param requestService
 * @param walletAddress address used to query balance
 * @param maxAmountOfTokens max limit of tokens that an access token can request
 * @param timeout amount of milliseconds that a token will be valid
 * @returns Express app
 */
export const entryServer = (ops: {
  accessTokenService: AccessTokenService;
  requestService: RequestService;
  walletAddress: string;
  maxAmountOfTokens: number;
  timeout: number;
}) => {
  app.use(express.json());

  app.get("/api/access-token", async (req, res) => {
    const accessToken = await ops.accessTokenService.createAccessToken({
      amount: ops.maxAmountOfTokens,
      timeout: ops.timeout,
    });
    return res.json({
      accessToken: accessToken?.token,
      expiredAt: accessToken?.expired_at,
      createdAt: accessToken?.created_at,
      amountLeft: ops.maxAmountOfTokens,
    });
  });

  app.post(
    "/api/request/funds/:blockchainAddress",
    body("amount").notEmpty().bail().isNumeric({ no_symbols: true }),
    body("chainId").notEmpty().bail().isNumeric(),
    tokenIsValid(
      ops.accessTokenService,
      ops.requestService,
      ops.maxAmountOfTokens,
      true
    ),
    async (req, res) => {
      // check if validation failed
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const nodeAddress = String(req.params.blockchainAddress);
      const amount = String(req.body.amount);
      const chainId = Number(req.body.chainId);
      const accessTokenHash = req.headers["x-access-token"] as string;
      const request = await ops.requestService.createRequest({
        nodeAddress,
        amount,
        accessTokenHash,
        chainId,
      });
      const allUnresolvedAndSuccessfulRequestsByAccessToken =
        await ops.requestService.getAllUnresolvedAndSuccessfulRequestsByAccessToken(
          accessTokenHash
        );
      const amountUsed = ops.requestService.sumAmountOfRequests(
        allUnresolvedAndSuccessfulRequestsByAccessToken
      );
      return res.json({
        id: request.id,
        amountLeft: ops.maxAmountOfTokens - amountUsed[chainId],
      });
    }
  );

  app.get(
    "/api/request/status",
    tokenIsValid(
      ops.accessTokenService,
      ops.requestService,
      ops.maxAmountOfTokens
    ),
    async (req, res) => {
      const requests = await ops.requestService.getRequests();
      return res.status(200).json(requests);
    }
  );

  app.get(
    "/api/request/status/:requestId",
    param("requestId").isNumeric(),
    tokenIsValid(
      ops.accessTokenService,
      ops.requestService,
      ops.maxAmountOfTokens
    ),
    async (req, res) => {
      // check if validation failed
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const requestId = Number(req.params.requestId);
      const request = await ops.requestService.getRequest(requestId);
      return res.status(200).json(request);
    }
  );

  app.get(
    "/api/funds",
    tokenIsValid(
      ops.accessTokenService,
      ops.requestService,
      ops.maxAmountOfTokens
    ),
    async (req, res) => {
      log.verbose(["getting funds for chains", [...validChainIds.keys()]]);
      const providers = await getProviders(Array.from(validChainIds.keys()));
      const balances = await getBalanceForAllChains(
        smartContractAddresses,
        ops.walletAddress,
        providers
      );
      const compromisedRequests =
        await ops.requestService.getAllUnresolvedRequests();
      const frozenBalances = await ops.requestService.sumAmountOfRequests(
        compromisedRequests ?? []
      );

      const availableBalances = ops.requestService.calculateAvailableFunds(
        balances,
        frozenBalances
      );
      return res.json({
        available: availableBalances,
        frozen: frozenBalances,
      });
    }
  );

  return app;
};
