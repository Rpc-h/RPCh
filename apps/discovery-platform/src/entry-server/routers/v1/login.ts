// @ts-ignore
import EthereumStrategy, { SessionNonceStore } from "passport-ethereum-siwe";
import passport from "passport";

import * as q from "../../../query";
import { createLogger } from "../../../utils";

import type { Pool, QueryResult } from "pg";
import type { Request, Response } from "express";

export type Login = {
  store: SessionNonceStore;
};

const log = createLogger(["router", "login"]);

const chainId = "eip155:1";

type VerifyCb = (err?: Error, user?: q.User | false) => {};

export function create(dbPool: Pool): Login {
  const store = new SessionNonceStore();
  const lState = { store };

  passport.use(
    new EthereumStrategy(lState, function verify(
      address: string,
      cb: VerifyCb
    ) {
      q.readLogin(dbPool, address, chainId)
        .then((res) => login(dbPool, address, res, cb))
        .catch((err) => {
          log.error("Error during readLogin query", err);
          cb(err);
        });
    })
  );

  passport.serializeUser(function (user, done) {
    if ("id" in user) {
      done(null, user.id);
    } else {
      const reason = "Encountered unexpected user object during serialization";
      log.error(reason);
      done(reason);
    }
  });

  passport.deserializeUser(function (id, done) {
    if (typeof id === "string") {
      q.readUserById(dbPool, id)
        .then((res) => {
          if (res.rowCount === 0) {
            return done(new Error("no user"));
          }
          done(null, res.rows[0]);
        })
        .catch((err) => {
          log.error("Error during readUserById query", err);
          done(err);
        });
    } else {
      const reason = "Encountered unexpted id during deserialization";
      log.error(reason);
      done(reason);
    }
  });

  return lState;
}

export function challenge({ store }: Login) {
  return function (req: Request, res: Response) {
    store.challenge(req, function (err: Error, nonce: string) {
      if (err) {
        log.error("Challenge error", err);
        const reason = "Internal server error";
        return res.status(500).json({ reason });
      }
      return res.status(201).json({ nonce });
    });
  };
}

export function signin() {
  return function (req: Request, res: Response) {
    req.session.save((err) => {
      if (err) {
        log.error("Error saving session", err);
        res.status(403).json({ ok: false });
      } else {
        res.status(200).json({ ok: true });
      }
    });
  };
}

async function login(
  dbPool: Pool,
  address: string,
  res: QueryResult<q.User>,
  cb: VerifyCb
) {
  if (res.rowCount === 0) {
    return createLogin(dbPool, address, cb);
  }
  if (res.rowCount === 1) {
    return cb(undefined, res.rows[0]);
  }
  const reason = "Wrong rowCount from readLogin query";
  log.error(reason, res);
  return cb(new Error(reason));
}

function createLogin(dbPool: Pool, address: string, cb: VerifyCb) {
  q.createUser(dbPool, {})
    .then((res) => {
      if (res.rowCount !== 1) {
        const reason = "Wrong rowCount from createUser query";
        log.error(reason, res);
        return cb(new Error(reason));
      }
      const user = res.rows[0];
      q.createChainCredential(dbPool, {
        user_id: user.id,
        address,
        chain: chainId,
      })
        .then(() => cb(undefined, user))
        .catch((err) => {
          log.error("Error during createChainCredential query", err);
          return cb(err);
        });
    })
    .catch((err) => {
      log.error("Error during createUser query", err);
      return cb(err);
    });
}
