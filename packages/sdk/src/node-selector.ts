import { shortPeerId, randomEl } from "./utils";
import * as NodePair from "./node-pair";
import * as EntryData from "./entry-data";
import * as ExitData from "./exit-data";
import * as NodeMatch from "./node-match";
import type { EntryNode } from "./entry-node";

export type ResultOk = {
  success: true;
  match: NodeMatch.NodeMatch;
  via: string;
};

export type ResultErr = { success: false; error: string };

export type Result = ResultOk | ResultErr;

type EntryPerf = EntryData.Perf & { entryNode: EntryNode };
type ExitPerf = ExitData.Perf & NodeMatch.NodeMatch;

/**
 * Try to distribute evenly with best route pairs preferred.
 *
 */
export function routePair(nodePairs: Map<string, NodePair.NodePair>): Result {
  const routePerfs = createRoutePerfs(nodePairs);
  return match(nodePairs, routePerfs);
}

/**
 * Try to distribute evenly with best route pairs preferred.
 * Exclude node match entry node from search.
 *
 */
export function fallbackRoutePair(
  nodePairs: Map<string, NodePair.NodePair>,
  exclude: EntryNode
): Result {
  const routePerfs = createRoutePerfs(nodePairs);
  const filtered = routePerfs.filter(
    ({ entryNode }) => entryNode.id !== exclude.id
  );
  return match(nodePairs, filtered);
}

export function isOk(res: Result): res is ResultOk {
  return res.success;
}

export function prettyPrint(res: Result) {
  if (isOk(res)) {
    const eId = shortPeerId(res.match.entryNode.id);
    const xId = shortPeerId(res.match.exitNode.id);
    return `${eId} > ${xId} (via ${res.via})`;
  }
  return `${res.error}`;
}

function match(
  nodePairs: Map<string, NodePair.NodePair>,
  routePerfs: ExitPerf[]
): Result {
  // special case no nodes
  if (routePerfs.length === 0) {
    return { success: false, error: "no nodes" };
  }
  // special case only one route
  if (routePerfs.length === 1) {
    return success(routePerfs[0], "only route available");
  }

  ////
  // 1. compare exit node performances
  const xLeastErrs = leastReqErrors(routePerfs);
  if (xLeastErrs.length === 1) {
    return success(xLeastErrs[0], "least request errors");
  }
  const xLeastOngoing = leastReqOngoing(xLeastErrs);
  if (xLeastOngoing.length === 1) {
    return success(xLeastOngoing[0], "least ongoing requests");
  }
  const xBestLats = bestReqLatencies(xLeastOngoing);
  if (xBestLats.length > 0) {
    return success(xBestLats[0], "best request latency");
  }

  const entryPerfs = createEntryPerfs(nodePairs, xLeastOngoing);

  ////
  // 2. compare entry node performances
  const eLeastErrs = leastSegErrors(entryPerfs);
  if (eLeastErrs.length === 1) {
    return eSuccess(eLeastErrs[0], xLeastOngoing, "least segment errors");
  }
  const eLeastOngoing = leastSegOngoing(eLeastErrs);
  if (eLeastOngoing.length === 1) {
    return eSuccess(eLeastOngoing[0], xLeastOngoing, "least ongoing segments");
  }
  const eBestLats = bestSegLatencies(eLeastOngoing);
  if (eBestLats.length > 0) {
    return eSuccess(eBestLats[0], xLeastOngoing, "best segment latency");
  }
  const eLeastMsgsErrs = leastMsgsErrors(eLeastOngoing);
  if (eLeastMsgsErrs.length === 1) {
    return eSuccess(
      eLeastMsgsErrs[0],
      xLeastOngoing,
      "least message retrieval errors"
    );
  }
  const eBestMsgsLats = bestMsgsLatencies(eLeastMsgsErrs);
  if (eBestMsgsLats.length > 0) {
    return eSuccess(
      eBestMsgsLats[0],
      xLeastOngoing,
      "best message retrieval latency"
    );
  }

  ////
  // 3. compare ping speed
  const eQuickestPing = quickestPing(eLeastMsgsErrs);
  if (eQuickestPing.length > 0) {
    return eSuccess(eQuickestPing[0], xLeastOngoing, "quickest version ping");
  }

  return { success: false, error: "insufficient data" };
}
function success(
  { entryNode, exitNode }: NodeMatch.NodeMatch,
  via: string
): ResultOk {
  return {
    success: true,
    match: {
      entryNode,
      exitNode,
    },
    via,
  };
}

function createRoutePerfs(nodePairs: Map<string, NodePair.NodePair>) {
  return Array.from(nodePairs.values()).reduce<ExitPerf[]>((acc, np) => {
    const perfs = Array.from(np.exitDatas).map(([xId, xd]) => ({
      ...ExitData.perf(xd),
      entryNode: np.entryNode,
      exitNode: np.exitNodes.get(xId)!,
    }));
    return acc.concat(perfs);
  }, []);
}

function leastReqErrors(routePerfs: ExitPerf[]): ExitPerf[] {
  routePerfs.sort((l, r) => l.failures - r.failures);
  const min = routePerfs[0].failures;
  const idx = routePerfs.findIndex(({ failures }) => min < failures);
  if (idx > 0) {
    return routePerfs.slice(0, idx);
  }
  return routePerfs;
}

function bestReqLatencies(routePerfs: ExitPerf[]): ExitPerf[] {
  const haveLats = routePerfs.filter(({ avgLats }) => avgLats > 0);
  haveLats.sort((l, r) => l.avgLats - r.avgLats);
  return haveLats;
}

function leastReqOngoing(routePerfs: ExitPerf[]): ExitPerf[] {
  routePerfs.sort((l, r) => l.ongoing - r.ongoing);
  const min = routePerfs[0].ongoing;
  const idx = routePerfs.findIndex(({ ongoing }) => min < ongoing);
  if (idx > 0) {
    return routePerfs.slice(0, idx);
  }
  return routePerfs;
}

function eSuccess(
  { entryNode }: EntryPerf,
  routePerfs: ExitPerf[],
  via: string
): ResultOk {
  const xPerfs = routePerfs.filter(
    ({ entryNode: en }) => en.id === entryNode.id
  );
  const el = randomEl(xPerfs);
  return {
    success: true,
    match: { entryNode, exitNode: el.exitNode },
    via,
  };
}

function createEntryPerfs(
  nodePairs: Map<string, NodePair.NodePair>,
  routePerfs: ExitPerf[]
): EntryPerf[] {
  const entryNodes = routePerfs.map(({ entryNode }) => entryNode);
  return Array.from(new Set(entryNodes)).map((entryNode) => {
    const ed = nodePairs.get(entryNode.id)!.entryData;
    return {
      ...EntryData.perf(ed),
      entryNode,
    };
  });
}

function leastSegErrors(entryPerfs: EntryPerf[]): EntryPerf[] {
  entryPerfs.sort((l, r) => l.segFailures - r.segFailures);
  const min = entryPerfs[0].segFailures;
  const idx = entryPerfs.findIndex(({ segFailures }) => min < segFailures);
  if (idx > 0) {
    return entryPerfs.slice(0, idx);
  }
  return entryPerfs;
}

function bestSegLatencies(entryPerfs: EntryPerf[]): EntryPerf[] {
  const haveLats = entryPerfs.filter(({ segAvgLats }) => segAvgLats > 0);
  haveLats.sort((l, r) => l.segAvgLats - r.segAvgLats);
  return haveLats;
}

function leastSegOngoing(entryPerfs: EntryPerf[]): EntryPerf[] {
  entryPerfs.sort((l, r) => l.segOngoing - r.segOngoing);
  const min = entryPerfs[0].segOngoing;
  const idx = entryPerfs.findIndex(({ segOngoing }) => min < segOngoing);
  if (idx > 0) {
    return entryPerfs.slice(0, idx);
  }
  return entryPerfs;
}

function leastMsgsErrors(entryPerfs: EntryPerf[]): EntryPerf[] {
  entryPerfs.sort((l, r) => l.msgsFails - r.msgsFails);
  const min = entryPerfs[0].msgsFails;
  const idx = entryPerfs.findIndex(({ msgsFails }) => min < msgsFails);
  if (idx > 0) {
    return entryPerfs.slice(0, idx);
  }
  return entryPerfs;
}

function bestMsgsLatencies(entryPerfs: EntryPerf[]): EntryPerf[] {
  const haveLats = entryPerfs.filter(({ msgsAvgLats }) => msgsAvgLats > 0);
  haveLats.sort((l, r) => l.msgsAvgLats - r.msgsAvgLats);
  return haveLats;
}

function quickestPing(entryPerfs: EntryPerf[]): EntryPerf[] {
  const havePing = entryPerfs.filter(({ pingDuration }) => pingDuration > 0);
  havePing.sort((l, r) => l.pingDuration - r.pingDuration);
  return havePing;
}