export type Heartbeats = {
  sent: number;
  success: number;
};

export type Peer = {
  peerId: string;
  multiAddr: string;
  heartbeats: Heartbeats[];
  lastSeen: number;
  quality: number;
  backoff: number;
  isNew: boolean;
  reportedVersion: string;
};

export type Peers = {
  connected: Peer[];
  announced: Peer[];
};

export function getPeers({
  hoprd_api_endpoint,
  hoprd_api_token,
}: {
  hoprd_api_endpoint: string;
  hoprd_api_token: string;
}): Promise<Peers> {
  const url = new URL(hoprd_api_endpoint);
  url.pathname = "/api/v3/node/peers";
  url.searchParams.set("quality", "1");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-auth-token": hoprd_api_token,
  };
  return fetch(url, { headers }).then((res) => res.json());
}
