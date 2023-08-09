import { utils as ethersUtils } from "ethers";
import { utils } from "@rpch/common";
import { getAddresses } from "../hoprd";
import { createLogger } from "../utils";

const log = createLogger(["register-nodes"]);

async function registerNode(
  discoveryPlatformEndpoint: string,
  client: string,
  chainId: string,
  hoprdPeerId: string,
  hoprdApiEndpoint: string,
  hoprdApiToken: string,
  exitNodePubKey: string,
  nativeAddress: string,
  hasExitNode: boolean
): Promise<void> {
  log.verbose("Registering node", {
    discoveryPlatformEndpoint,
    chainId,
    hoprdPeerId,
    hoprdApiEndpoint,
    hoprdApiToken,
    exitNodePubKey,
    nativeAddress,
    hasExitNode,
  });

  const [url, headers] = utils.createApiUrl(
    "http",
    discoveryPlatformEndpoint,
    "/api/v1/node/register"
  );
  return fetch(url.toString(), {
    method: "POST",
    headers: { ...headers, client },
    body: JSON.stringify({
      hasExitNode,
      peerId: hoprdPeerId,
      chainId,
      hoprdApiEndpoint,
      hoprdApiToken,
      exitNodePubKey,
      nativeAddress,
    }),
  }).then((res) => res.json() as any);
}

export default async function main(
  discoveryPlatformEndpoint: string,
  client: string,
  chainId: string,
  hoprdApiEndpoints: string[],
  hoprdApiEndpointsExt: string[],
  hoprdApiTokens: string[],
  exitNodePubKeys: string[],
  hasExitNodes: boolean[]
): Promise<void> {
  log.normal("Registering exit nodes", {
    discoveryPlatformEndpoint,
    chainId,
    hoprdApiEndpoints,
    hoprdApiEndpointsExt,
    hoprdApiTokens,
    exitNodePubKeys,
    hasExitNodes,
  });

  if (
    [
      hoprdApiEndpointsExt.length,
      hoprdApiTokens.length,
      exitNodePubKeys.length,
      hasExitNodes.length,
    ].some((length) => length !== hoprdApiEndpoints.length)
  ) {
    throw Error(
      `Lengths of 'hoprdApiEndpoints', 'hoprdApiEndpointsExt', 'hoprdApiTokens', 'exitNodePubKeys', 'hasExitNodes' do no match`
    );
  }

  const groups: {
    hoprdApiEndpoint: string;
    hoprdApiEndpointExt: string;
    hoprdApiToken: string;
    exitNodePubKey: string;
    hoprdPeerId: string;
    chainId: string;
    hasExitNode: boolean;
  }[] = [];

  // get PeerIds in parallel and fill in groups object
  await Promise.all(
    hoprdApiEndpoints.map(async (hoprdApiEndpoint, index) => {
      const hoprdApiEndpointExt = hoprdApiEndpointsExt[index];
      const hoprdApiToken = hoprdApiTokens[index];
      const exitNodePubKey = exitNodePubKeys[index];
      const hoprdPeerId = await getAddresses(
        hoprdApiEndpoint,
        hoprdApiToken
      ).then((res) => res.hopr);
      const hasExitNode = hasExitNodes[index];
      groups.push({
        hoprdApiEndpoint,
        hoprdApiEndpointExt,
        hoprdApiToken,
        exitNodePubKey,
        hoprdPeerId,
        chainId,
        hasExitNode,
      });
    })
  );

  for (const nodes of groups) {
    const exitNodeAddress = ethersUtils.computeAddress(nodes.exitNodePubKey);
    await registerNode(
      discoveryPlatformEndpoint,
      client,
      chainId,
      nodes.hoprdPeerId,
      nodes.hoprdApiEndpointExt,
      nodes.hoprdApiToken,
      nodes.exitNodePubKey,
      exitNodeAddress,
      nodes.hasExitNode
    );
  }
}
