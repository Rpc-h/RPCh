import cors = require('cors');
import express, { Request, Response } from 'express';
import passport from 'passport';
import session from 'express-session';
import { Pool } from 'pg';
import { Utils } from '@rpch/sdk';
import { checkSchema, matchedData, query, validationResult } from 'express-validator';

import * as client from './client';
import * as login from './login';
import * as middleware from './middleware';
import * as node from './node';
import * as quota from './quota';

import * as configs from './../../../configs';
import * as qNode from './../../../node';

import type { Secrets } from './../../../secrets';

const log = Utils.logger(['discovery-platform', 'router']);

// Express Router
export const v1Router = (ops: { dbPool: Pool; secrets: Secrets; url: string }) => {
    const loginState = login.create(ops.dbPool, ops.secrets, ops.url);
    const router = express.Router();

    router.use(
        session({
            secret: ops.secrets.sessionSecret,
            cookie: { path: '/', secure: true, maxAge: undefined, sameSite: 'none' },
            resave: false,
            saveUninitialized: false,
            // cookie: { secure: false, maxAge: 60000 },
        }),
    );
    router.use(passport.initialize());
    router.use(passport.session());
    router.use(
        cors({
            origin: true,
            credentials: true,
        }),
    );
    router.use(express.json());

    // log entry calls
    router.use((req, _res, next) => {
        const { method, path, params, body } = req;
        log.verbose(`${method.toUpperCase()} ${path}`, {
            params,
            body,
        });
        next();
    });

    router.get(
        '/nodes/pairings',
        middleware.clientAuthorized(ops.dbPool),
        query('amount').default(10).isInt({ min: 1, max: 100 }),
        query('since').optional().isISO8601(),
        query('force_zero_hop').optional().toBoolean(),
        getNodesPairings(ops.dbPool),
    );

    router.post(
        '/node/register',
        middleware.adminAuthorized(ops.secrets.adminSecret),
        checkSchema(node.createSchema),
        middleware.validateStop,
        node.create(ops.dbPool),
    );

    ////
    // quota

    router.post(
        '/quota/request',
        middleware.nodeAuthorized(ops.dbPool),
        checkSchema(quota.schema),
        middleware.validateStop,
        quota.request(ops.dbPool),
    );

    router.post(
        '/quota/response',
        middleware.nodeAuthorized(ops.dbPool),
        checkSchema(quota.schema),
        middleware.validateStop,
        quota.response(ops.dbPool),
    );

    ////
    // authentication
    router.post('/login/ethereum/challenge', login.challenge(loginState));

    router.post(
        '/login/ethereum',
        passport.authenticate('ethereum', { failureMessage: true }),
        login.signin(),
    );

    router.get('/login/google', passport.authenticate('google'));
    router.get(
        '/oauth2/redirect/google',
        passport.authenticate('google', {
            failureRedirect: '/login/google',
            failureMessage: true,
        }),
        function (req, res) {
            res.redirect('/login/google');
        },
    );

    ////
    // clients

    router.get('/clients', middleware.userAuthorized(), client.index(ops.dbPool));
    router.post(
        '/clients',
        middleware.userAuthorized(),
        checkSchema(client.createSchema),
        middleware.validateStop,
        client.create(ops.dbPool),
    );
    router.get('/clients/:id', middleware.userAuthorized(), client.read(ops.dbPool));
    router.patch(
        '/clients/:id',
        middleware.userAuthorized(),
        checkSchema(client.updateSchema),
        middleware.validateStop,
        client.update(ops.dbPool),
    );
    router.put(
        '/clients/:id',
        middleware.userAuthorized(),
        checkSchema(client.updateSchema),
        middleware.validateStop,
        client.update(ops.dbPool),
    );
    router.delete('/clients/:id', middleware.userAuthorized(), client.del(ops.dbPool));

    /*
  router.get(
    "/node",
    middleware.metric(requestDurationHistogram),
    checkSchema(getNodeSchema),
    getCache<RegisteredNodeDB[]>(
      (req) => req.originalUrl || req.url,
      (body) => {
        const unstableNodes = getUnstableNodes();
        return body.reduce<RegisteredNodeDB[]>((result, node) => {
          if (!unstableNodes.includes(node.id)) {
            result.push(node);
          }
          return result;
        }, []);
      }
    ), // check if response is in cache
    async (
      req: Request<
        {},
        {},
        {},
        {
          excludeList?: string;
          hasExitNode?: string;
          status?: RegisteredNodeDB["status"];
        }
      >,
      res: Response
    ) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 400 })
            .inc();
          return res.status(400).json({ errors: errors.array() });
        }
        let { hasExitNode, excludeList: excludeListStr, status } = req.query;

        let excludeList: string[] = [];
        if (!excludeListStr) excludeList = [];
        else if (
          typeof excludeListStr === "string" &&
          excludeListStr.length > 0
        ) {
          excludeList = excludeListStr.split(",");
        }

        // expand 'excludeList' with unstable nodes
        const unstableNodes = getUnstableNodes();
        if (unstableNodes.length > 0) {
          log.verbose(
            "We have %i unstable nodes, adding to 'excludeList'",
            unstableNodes.length
          );
          for (const unstableNode of unstableNodes) {
            if (excludeList.includes(unstableNode)) continue;
            excludeList.push(unstableNode);
          }
        }

        const nodes = await getRegisteredNodes(ops.db, {
          excludeList,
          hasExitNode: hasExitNode ? hasExitNode === "true" : undefined,
          status,
        }).then((nodes) => {
          // if we are running in sandbox, convert endpoint to localhost
          if (constants.RUNNING_IN_SANDBOX) {
            nodes = nodes.map(toLocalhostEndpoint);
          }
          return nodes;
        });

        // cache response for 1 min
        setCache(req.originalUrl || req.url, 60e3, nodes);
        counterSuccessfulRequests
          .labels({ method: req.method, path: req.path, status: 200 })
          .inc();
        return res.json(nodes);
      } catch (e) {
        log.error("Can not get nodes", e);
        counterFailedRequests
          .labels({ method: req.method, path: req.path, status: 500 })
          .inc();
        return res.status(500).json({ errors: "Unexpected error" });
      }
    }
  );

  router.get(
    "/node/:peerId",
    middleware.metric(requestDurationHistogram),
    param("peerId").isAlphanumeric(),
    clientExists(ops.db),
    async (req: Request<{ peerId: string }>, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 400 })
            .inc();
          return res.status(400).json({ errors: errors.array() });
        }
        const { peerId }: { peerId: string } = req.params;

        const node = await getRegisteredNode(ops.db, peerId).then((node) => {
          // if we are running in sandbox, convert endpoint to localhost
          if (node && constants.RUNNING_IN_SANDBOX) {
            node = toLocalhostEndpoint(node);
          }
          return node;
        });

        counterSuccessfulRequests
          .labels({ method: req.method, path: req.path, status: 200 })
          .inc();
        return res.json({ node });
      } catch (e) {
        log.error("Can not get node with id", e);
        counterFailedRequests
          .labels({ method: req.method, path: req.path, status: 500 })
          .inc();
        return res.status(500).json({ errors: "Unexpected error" });
      }
    }
  );

  router.post(
    "/client/quota",
    middleware.metric(requestDurationHistogram),
    header("x-secret-key")
      .exists()
      .custom((val) => val === ops.secrets.adminSecret),
    body("client").exists(),
    body("quota").exists().bail().isNumeric(),
    async (req, res) => {
      try {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 400 })
            .inc();
          return res.status(400).json({ errors: validationErrors.array() });
        }
        const { client: clientId, quota } = req.body;
        let dbClient: ClientDB | undefined;

        // check if client exists
        try {
          dbClient = await getClient(ops.db, clientId);
        } catch (e) {
          if (e instanceof errors.QueryResultError) {
            dbClient = await createClient(ops.db, {
              id: clientId,
              payment: "premium",
              quotaPaid: BigInt(0),
              quotaUsed: BigInt(0),
            });
          }
        }

        if (!dbClient) throw Error("Could not create Client");

        if (dbClient.payment === constants.TRIAL_PAYMENT_MODE) {
          // update client to premium of it was previously trial
          await updateClient(ops.db, { ...dbClient, payment: "premium" });
        }

        const createdQuota = await createQuota(ops.db, {
          clientId: dbClient.id,
          quota: BigInt(quota),
          actionTaker: "discovery-platform",
          paidBy: dbClient.id,
        });

        counterSuccessfulRequests
          .labels({ method: req.method, path: req.path, status: 200 })
          .inc();

        return res.json({ quota: createdQuota });
      } catch (e) {
        log.error("Can not create funds", e);
        counterFailedRequests
          .labels({ method: req.method, path: req.path, status: 500 })
          .inc();
        return res.status(500).json({ errors: "Unexpected error" });
      }
    }
  );

  router.delete(
    "/request/entry-node/:id",
    middleware.metric(requestDurationHistogram),
    header("x-secret-key")
      .exists()
      .custom((val) => val === ops.secrets.adminSecret),
    param("id").isAlphanumeric(),
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 400 })
            .inc();
          return res.status(400).json({ errors: validationErrors.array() });
        }
        const { id }: { id: string } = req.params;
        const node = await deleteRegisteredNode(ops.db, id);
        counterSuccessfulRequests
          .labels({ method: req.method, path: req.path, status: 200 })
          .inc();
        return res.json({ node });
      } catch (e) {
        log.error("Can not delete registered_node", e);
        counterFailedRequests
          .labels({ method: req.method, path: req.path, status: 500 })
          .inc();
        return res.status(500).json({ errors: "Unexpected error" });
      }
    }
  );

  router.get(
    "/request/trial",
    middleware.metric(requestDurationHistogram),
    query("label")
      .optional()
      .custom((value) => isListSafe(value)),
    async (req: Request<{}, {}, {}, { label?: string }>, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          log.verbose("validation error", errors.array());
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 400 })
            .inc();
          return res.status(400).json({ errors: errors.array() });
        }
        const { label } = req.query;
        // create trial client
        const trialClient = await createTrialClient(
          ops.db,
          label ? label.split(",") : []
        );

        counterSuccessfulRequests
          .labels({ method: req.method, path: req.path, status: 200 })
          .inc();

        return res.json({ client: trialClient.id });
      } catch (e) {
        log.error("Can not create trial client", e);
        counterFailedRequests
          .labels({ method: req.method, path: req.path, status: 500 })
          .inc();
        return res.status(500).json({ errors: "Unexpected error" });
      }
    }
  );

  router.post(
    "/request/entry-node",
    middleware.metric(requestDurationHistogram),
    body("excludeList")
      .optional()
      .isArray()
      .withMessage("Must be an array")
      .custom((arr) => arr.every((item: unknown) => typeof item === "string"))
      .withMessage("Every item in the array must be a string"),
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          log.verbose("validation error", errors.array());
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 400 })
            .inc();
          return res.status(400).json({ errors: errors.array() });
        }
        let { excludeList = [], client } = req.body as {
          excludeList: string[];
          client?: string;
        };

        if (!client) {
          // check if client was sent in headers
          client = req.headers["x-rpch-client"] as string;
        }

        if (!client) {
          return res
            .status(400)
            .json({ errors: "client was not sent in request" });
        }

        let dbClient = await getClient(ops.db, client);

        const clientIsTrialMode =
          dbClient?.payment === constants.TRIAL_PAYMENT_MODE;
        // set who is going to pay for quota
        const paidById = clientIsTrialMode
          ? constants.TRIAL_CLIENT_ID
          : dbClient?.id;

        // CAUSING OUTAGE
        // // check if client has enough quota
        // const doesClientHaveQuotaResponse = await doesClientHaveQuota(
        //   ops.db,
        //   paidById,
        //   ops.baseQuota
        // );
        // if (!doesClientHaveQuotaResponse) {
        //   return res.status(403).json({
        //     body: "Client does not have enough quota",
        //   });
        // }

        // expand 'excludeList' with unstable nodes
        const unstableNodes = getUnstableNodes();
        if (unstableNodes.length > 0) {
          log.verbose(
            "We have unstable nodes %i, adding to 'excludeList'",
            unstableNodes.length
          );
          for (const unstableNode of unstableNodes) {
            if (excludeList.includes(unstableNode)) continue;
            excludeList.push(unstableNode);
          }
        }

        // choose selected entry node
        const selectedNode = await getEligibleNode(ops.db, {
          excludeList,
        }).then((node) => {
          // if we are running in sandbox, convert endpoint to localhost
          if (node && constants.RUNNING_IN_SANDBOX) {
            node = toLocalhostEndpoint(node);
          }
          return node;
        });

        log.verbose("selected entry node", selectedNode);
        if (!selectedNode) {
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 404 })
            .inc();
          return res
            .status(404)
            .json({ errors: "Could not find eligible node" });
        }

        // TODO: ACTIVATE THIS WHEN FUNDING IS STABLE
        // // calculate how much should be funded to entry node
        // const amountToFund = getRewardForNode(
        //   ops.baseQuota,
        //   BASE_EXTRA,
        //   selectedNode
        // );

        // // fund entry node
        // await ops.fundingServiceApi.requestFunds({
        //   amount: amountToFund,
        //   node: selectedNode,
        // });

        // create negative quota (showing that the client has used up initial quota)
        await createQuota(ops.db, {
          clientId: dbClient.id,
          quota: ops.baseQuota * BigInt(-1),
          actionTaker: "discovery platform",
          paidBy: paidById,
        });

        counterSuccessfulRequests
          .labels({ method: req.method, path: req.path, status: 200 })
          .inc();

        return res.json({
          ...selectedNode,
          accessToken: selectedNode.hoprd_api_token,
        });
      } catch (e) {
        log.error("Can not retrieve entry node", e);
        counterFailedRequests
          .labels({ method: req.method, path: req.path, status: 500 })
          .inc();
        return res.status(500).json({ errors: "Unexpected error" });
      }
    }
  );
 */

    /*
  router.post(
    "/request/one-hop-delivery-routes",
    middleware.metric(requestDurationHistogram),
    body("excludeList")
      .optional()
      .isArray()
      .withMessage("Must be an array")
      .custom((arr) => arr.every((item: unknown) => typeof item === "string"))
      .withMessage("Every item in the array must be a string"),
    body("amount").optional().isInt({ min: 1, max: 10 }),
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          log.verbose("validation error", errors.array());
          counterFailedRequests
            .labels({ method: req.method, path: req.path, status: 400 })
            .inc();
          return res.status(400).json({ errors: errors.array() });
        }
        let {
          excludeList = [],
          amount = 1,
          client,
        } = req.body as {
          excludeList: string[];
          amount: number;
          client?: string;
        };

        if (!client) {
          // check if client was sent in headers
          client = req.headers["x-rpch-client"] as string;
        }

        if (!client) {
          return res
            .status(400)
            .json({ errors: "client was not sent in request" });
        }

        let dbClient = await getClient(ops.db, client);

        const clientIsTrialMode =
          dbClient?.payment === constants.TRIAL_PAYMENT_MODE;
        // set who is going to pay for quota
        const paidById = clientIsTrialMode
          ? constants.TRIAL_CLIENT_ID
          : dbClient?.id;

        // TODO: check if client has enough quota

        // using the availability monitor results
        // we create a object keyed by WORKING entry nodes
        // linked with WORKING exit nodes which availability-monitor
        // has proven connectivity between them
        const amResults = ops.getAvailabilityMonitorResults();
        const routes = Array.from(amResults.entries()).reduce<
          { entryNodePeerId: string; exitNodePeerIds: string[] }[]
        >((result, [entryNodePeerId, entryNodeInfo]) => {
          const { outgoingChannels, exitNodesToOutgoingChannels } =
            entryNodeInfo.connectivityReview;
          const intermediatePeerIds: string[] = [];
          const exitNodePeerIds: string[] = [];

          // entry nodes must be STABLE and have at least ONE outgoing channel
          // exclude entry nodes which are passed in the excluded list
          if (
            entryNodeInfo.isStableAndHasOutgoingChannel &&
            !excludeList.includes(entryNodePeerId)
          ) {
            // find intermediate nodes with working PING
            for (const [intermediatePeerId, ping] of Object.entries(
              outgoingChannels
            )) {
              if (ping > 0) intermediatePeerIds.push(intermediatePeerId);
            }

            // find exit nodes which are STABLE and have a working PING with one of the intermediate nodes
            for (const [exitNodePeerId, outgoingChannels] of Object.entries(
              exitNodesToOutgoingChannels
            )) {
              const exitNodeInfo = amResults.get(exitNodePeerId);
              // exit node must be stable
              if (!exitNodeInfo || !exitNodeInfo.isStable) continue;

              for (const [intermediatePeerId, ping] of Object.entries(
                outgoingChannels
              )) {
                if (
                  intermediatePeerIds.includes(intermediatePeerId) &&
                  ping > 0 &&
                  !exitNodePeerIds.includes(exitNodePeerId)
                ) {
                  exitNodePeerIds.push(exitNodePeerId);
                }
              }
            }

            // update result if we have found working routes
            if (exitNodePeerIds.length > 0) {
              result.push({ entryNodePeerId, exitNodePeerIds });
            }
          }

          return result;
        }, []);

        // get a random selection of routes
        const selectedRoutes = routes
          .sort(() => 0.5 - Math.random()) // shuffles array
          .slice(0, Math.max(routes.length, amount));

        // get a unique Set of all PeerIds we need to pull data
        // for within the DB
        const allPeerIdsSet = selectedRoutes.reduce<Set<string>>(
          (result, { entryNodePeerId, exitNodePeerIds }) => {
            result.add(entryNodePeerId);
            for (const exitNodePeerId of exitNodePeerIds)
              result.add(exitNodePeerId);
            return result;
          },
          new Set()
        );

        // get node data for all peerids
        const allPeerIdsData = await getRegisteredNodes(ops.db, {
          includeList: Array.from(allPeerIdsSet.values()),
        }).then((nodes) => {
          // if we are running in sandbox, convert endpoint to localhost
          if (constants.RUNNING_IN_SANDBOX) {
            nodes = nodes.map(toLocalhostEndpoint);
          }
          return nodes;
        });

        // TODO: handle funding

        // create negative quota (showing that the client has used up initial quota)
        await createQuota(ops.db, {
          clientId: dbClient.id,
          quota: ops.baseQuota * BigInt(amount) * BigInt(-1),
          actionTaker: "discovery platform",
          paidBy: paidById,
        });

        counterSuccessfulRequests
          .labels({ method: req.method, path: req.path, status: 200 })
          .inc();

        return res.json({
          selectedRoutes: routes,
          nodes: allPeerIdsData,
        });
      } catch (e) {
        log.error("Can not retrieve entry node", e);
        counterFailedRequests
          .labels({ method: req.method, path: req.path, status: 500 })
          .inc();
        return res.status(500).json({ errors: "Unexpected error" });
      }
    }
  );
  */

    return router;
};

function getNodesPairings(dbPool: Pool) {
    return async function (req: Request, res: Response) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(errors.mapped());
        }

        const data = matchedData(req);
        const forceZeroHop = !!data.force_zero_hop;
        qNode
            .listPairings(dbPool, data.amount, data.since, forceZeroHop)
            .then((qPairings) => {
                if (qPairings.length === 0) {
                    // table is empty
                    return res.status(204).end();
                }

                // collect pairings by entry node
                const pairings = qPairings.reduce<Map<string, Set<string>>>(
                    (acc, { entryId, exitId }) => {
                        const v = acc.get(entryId);
                        if (v) {
                            v.add(exitId);
                            return acc;
                        }
                        acc.set(entryId, new Set([exitId]));
                        return acc;
                    },
                    new Map(),
                );

                // query entry and exit nodes
                const qEntryNodes = qNode.listEntryNodes(dbPool, pairings.keys());
                const exitIds = Array.from(pairings.values()).reduce((acc, xIds) => {
                    for (const xId of xIds) {
                        acc.add(xId);
                    }
                    return acc;
                }, new Set());
                const qExitNodes = qNode.listExitNodes(dbPool, exitIds);
                const qRPCServerVersion = configs.readConfig(
                    dbPool,
                    configs.Keys.RPCh_RPC_SERVER_VERSION,
                );
                const qSDKVersion = configs.readConfig(dbPool, configs.Keys.RPCh_SDK_VERSION);

                // wait for entry and exit nodes query results
                Promise.all([qEntryNodes, qExitNodes, qRPCServerVersion, qSDKVersion])
                    .then(([qEntries, qExits, vRPCserver, vSDK]) => {
                        const matchedAt = qPairings[0].createdAt;
                        const entryNodes = qEntries.map((e) => ({
                            ...e,
                            recommendedExits: Array.from(pairings.get(e.id) as Set<string>),
                        }));
                        return res.status(200).json({
                            entryNodes,
                            exitNodes: qExits,
                            matchedAt,
                            versions: {
                                sdk: vSDK,
                                rpcServer: vRPCserver,
                            },
                        });
                    })
                    .catch((ex) => {
                        log.error('Error during read registered_nodes queries', ex);
                        const reason = 'Error querying database';
                        return res.status(500).json({ reason });
                    });
            })
            .catch((ex) => {
                log.error(
                    `Error during read ${forceZeroHop ? 'zero' : 'one'}_hop_pairings query`,
                    ex,
                );
                const reason = 'Error querying database';
                return res.status(500).json({ reason });
            });
    };
}
