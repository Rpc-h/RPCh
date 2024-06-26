import LZString from 'lz-string';
import * as Res from './result';

export type ReqPayload = {
    clientId: string; // client identifier
    endpoint: string; // http endpoint url, target of the request
    body?: string; // request body
    headers?: Record<string, string>; // request headers, if left empty:  { 'Content-Type': 'application/json' }
    method?: string; // request method, if left empty: get
    timeout?: number; // request timeout from the endpoint
    // dev/debug params
    hops?: number; // defaults to 1
    relayPeerId?: string; // default to autorouting
    withDuration?: boolean; // request duration
    chainId?: string; // provider chain id
};

export enum RespType {
    Resp,
    CounterFail,
    DuplicateFail,
    Error,
}

export type RespPayload =
    | {
          type: RespType.Resp;
          headers: Record<string, string>; // HTTP response headers
          status: number; // HTTP status
          statusText: string; // HTTP status text
          text: string; // response text
          callDuration?: number;
          exitAppDuration?: number;
      }
    | {
          type: RespType.CounterFail;
          counter: number; // current timestamp on exit node
      }
    | {
          type: RespType.DuplicateFail;
      }
    | {
          type: RespType.Error;
          reason: string; // reason, describing the problem
      };

export type InfoPayload = {
    peerId: string; // node peerId
    version: string; // node version
    counter: number; // current timestamp on node
    // dev/debug params
    relayShortIds?: string[]; // shortIds of relays
};

type TransportReqPayload = {
    c: string; // clientId
    e: string; // endpoint
    b?: string; // body
    h?: Record<string, string>; // headers
    m?: string; // method
    t?: number; // timeout
    // dev/debug
    n?: number; // hops
    r?: string; // relayPeerId
    w?: boolean; // withDuration
    i?: string; // chainId
};

type TransportRespPayload =
    | {
          t: RespType.Resp;
          h: Record<string, string>; // HTTP response header
          s: number; // HTTP status
          a: string; // HTTP status text
          x: string; // response text
          f?: number;
          e?: number;
      }
    | {
          t: RespType.CounterFail;
          c: number; // current timestamp on exit node
      }
    | {
          t: RespType.DuplicateFail;
      }
    | {
          t: RespType.Error;
          r: string; // reason, describing the problem
      };

type TransportInfoPayload = {
    i: string; // peerId
    v: string; // version
    c: number; // current timestamp on node
    // dev/debug params
    r?: string[]; // shortIds of relays
};

export function encodeReq(payload: ReqPayload): Res.Result<string> {
    const t = reqToTrans(payload);
    try {
        const res = LZString.compressToUTF16(JSON.stringify(t));
        return Res.ok(res);
    } catch (ex) {
        return Res.err(`Error encoding request payload: ${ex}`);
    }
}

export function decodeReq(payload: string): Res.Result<ReqPayload> {
    try {
        const res = JSON.parse(LZString.decompressFromUTF16(payload));
        return Res.ok(transToReq(res));
    } catch (ex) {
        return Res.err(`Error decoding request payload: ${ex}`);
    }
}

export function encodeResp(payload: RespPayload): Res.Result<string> {
    const t = respToTrans(payload);
    try {
        const res = LZString.compressToUTF16(JSON.stringify(t));
        return Res.ok(res);
    } catch (ex) {
        return Res.err(`Error encoding response payload: ${ex}`);
    }
}

export function decodeResp(payload: string): Res.Result<RespPayload> {
    try {
        const res = JSON.parse(LZString.decompressFromUTF16(payload));
        return Res.ok(transToResp(res));
    } catch (ex) {
        return Res.err(`Error decoding response payload: ${ex}`);
    }
}

export function encodeInfo(payload: InfoPayload): Res.Result<string> {
    const t = infoToTrans(payload);
    try {
        const res = LZString.compressToUTF16(JSON.stringify(t));
        return Res.ok(res);
    } catch (ex) {
        return Res.err(`Error encoding info payload: ${ex}`);
    }
}

export function decodeInfo(payload: string): Res.Result<InfoPayload> {
    try {
        const res = JSON.parse(LZString.decompressFromUTF16(payload));
        return Res.ok(transToInfo(res));
    } catch (ex) {
        return Res.err(`Error decoding info payload: ${ex}`);
    }
}

function reqToTrans(r: ReqPayload): TransportReqPayload {
    const t: TransportReqPayload = {
        c: r.clientId,
        e: r.endpoint,
    };

    if (r.body) {
        t.b = r.body;
    }
    if (r.headers) {
        t.h = r.headers;
    }
    if (r.method) {
        t.m = r.method;
    }
    if (r.timeout) {
        t.t = r.timeout;
    }
    if (r.hops) {
        t.n = r.hops;
    }
    if (r.relayPeerId) {
        t.r = r.relayPeerId;
    }
    if (r.withDuration) {
        t.w = r.withDuration;
    }
    if (r.chainId) {
        t.i = r.chainId;
    }
    return t;
}

function respToTrans(r: RespPayload): TransportRespPayload {
    switch (r.type) {
        case RespType.Resp: {
            const t: TransportRespPayload = {
                t: RespType.Resp,
                h: r.headers,
                s: r.status,
                a: r.statusText,
                x: r.text,
            };

            if (r.callDuration) {
                t.f = r.callDuration;
            }
            if (r.exitAppDuration) {
                t.e = r.exitAppDuration;
            }
            return t;
        }
        case RespType.CounterFail:
            return {
                t: RespType.CounterFail,
                c: r.counter,
            };
        case RespType.DuplicateFail: {
            return {
                t: RespType.DuplicateFail,
            };
        }
        case RespType.Error:
            return {
                t: RespType.Error,
                r: r.reason,
            };
    }
}

function infoToTrans(r: InfoPayload): TransportInfoPayload {
    const t: TransportInfoPayload = {
        i: r.peerId,
        v: r.version,
        c: r.counter,
    };

    if (r.relayShortIds) {
        t.r = r.relayShortIds;
    }
    return t;
}

function transToReq(t: TransportReqPayload): ReqPayload {
    return {
        clientId: t.c,
        endpoint: t.e,
        body: t.b,
        headers: t.h,
        method: t.m,
        timeout: t.t,
        hops: t.n,
        relayPeerId: t.r,
        withDuration: t.w,
        chainId: t.i,
    };
}

function transToResp(t: TransportRespPayload): RespPayload {
    switch (t.t) {
        case RespType.Resp:
            return {
                type: RespType.Resp,
                headers: t.h,
                status: t.s,
                statusText: t.a,
                text: t.x,
                callDuration: t.f,
                exitAppDuration: t.e,
            };
        case RespType.CounterFail:
            return {
                type: RespType.CounterFail,
                counter: t.c,
            };
        case RespType.DuplicateFail: {
            return {
                type: RespType.DuplicateFail,
            };
        }
        case RespType.Error:
            return {
                type: RespType.Error,
                reason: t.r,
            };
    }
}

function transToInfo(t: TransportInfoPayload): InfoPayload {
    return {
        peerId: t.i,
        version: t.v,
        counter: t.c,
        relayShortIds: t.r,
    };
}
