import express from "express";
import { AccessTokenService } from "../access-token";
import { getBalanceForAllChains, getProviders } from "../blockchain";
import { RequestService } from "../request";
import { createLogger } from "../utils";
import { tokenIsValid } from "./middleware";
import { body, validationResult, param } from "express-validator";
import * as constants from "../constants";

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
    log.verbose("GET /api/access-token");
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
      log.verbose(
        `POST /api/request/funds/:blockchainAddress`,
        req.params,
        req.body
      );

      // check if validation failed
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const nodeAddress = String(req.params.blockchainAddress);
      const amount = String(req.body.amount);
      const chainId = Number(req.body.chainId);

      // can be enforced because the existence is checked in the middleware
      const accessTokenHash: string | undefined =
        req.headers["x-access-token"]!.toString();

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
      log.verbose(`GET /api/request/status`);
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
      log.verbose(`GET /api/request/status/:requestId`, req.params);
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
      log.verbose(`GET /api/funds`);
      log.verbose([
        "getting funds for chains",
        [...Object.keys(constants.CONNECTION_INFO)],
      ]);
      const providers = await getProviders(
        [...Object.keys(constants.CONNECTION_INFO)].map(Number)
      );
      const balances = await getBalanceForAllChains(
        constants.SMART_CONTRACTS_PER_CHAIN,
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

      // all balances are in wei
      return res.json({
        available: availableBalances,
        frozen: frozenBalances,
      });
    }
  );

  return app;
};
