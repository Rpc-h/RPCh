import LZString from "lz-string";
import * as JRPC from "./jrpc";

export type ReqPayload = {
  provider: string;
  clientId: string;
  req: JRPC.Request;
};

export type RespPayload = {
  resp: JRPC.Response;
};

export function encodeReq(payload: ReqPayload): string {
  return LZString.compressToUTF16(JSON.stringify(payload));
}

export function decodeReq(payload: string): ReqPayload {
  return JSON.parse(LZString.decompressFromUTF16(payload));
}

export function encodeResp(payload: RespPayload): string {
  return LZString.compressToUTF16(JSON.stringify(payload));
}

export function decodeResp(payload: string): RespPayload {
  return JSON.parse(LZString.decompressFromUTF16(payload));
}