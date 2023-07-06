export type OnlineHistoryEntry = { date: number; online: boolean };

export type NodeHistoryEntry = {
  started: number;
  ended?: number;
  success: boolean;
};

export type Reliability = {
  onlineHistory: OnlineHistoryEntry[]; // LIFO queue
  exitNodesHistory: Map<string, NodeHistoryEntry[]>; // LIFO queue
};

export function empty(): Reliability {
  return {
    onlineHistory: [],
    exitNodesHistory: new Map(),
  };
}

export function updateOnline(rel: Reliability, online: boolean): Reliability {
  const entry = { date: Date.now(), online };
  rel.onlineHistory.unshift(entry);
  return rel;
}

export function expireOlderThan(
  { onlineHistory, exitNodesHistory }: Reliability,
  timeout: number
): Reliability {
  // remove old online history entries
  const threshold = Date.now() - timeout;
  const onlineIdx = onlineHistory.findIndex(function ({ date }) {
    return date < threshold;
  });
  if (onlineIdx >= 0) {
    onlineHistory = onlineHistory.slice(0, onlineIdx);
  }

  // remove old exit nodes history entries
  for (const id of exitNodesHistory.keys()) {
    const hist = exitNodesHistory.get(id)!;
    const idx = hist.findIndex(function ({ ended }) {
      if (ended) {
        return ended < threshold;
      } else {
        return false;
      }
    });
    if (idx >= 0) {
      exitNodesHistory.set(id, hist.slice(0, idx));
    }
  }

  return {
    onlineHistory,
    exitNodesHistory,
  };
}

export function setExitNodeOngoing(
  rel: Reliability,
  peerId: string
): Reliability {
  const entry = { started: Date.now(), success: false, ongoing: true };
  let hist = rel.exitNodesHistory.get(peerId);
  if (hist) {
    hist.unshift(entry);
  } else {
    hist = [entry];
  }
  rel.exitNodesHistory.set(peerId, hist);
  return rel;
}

export function updateExitNodeSuccess(
  rel: Reliability,
  peerId: string,
  success: boolean
): { res: "ok"; rel: Reliability } | { res: "error"; reason: string } {
  const hist = rel.exitNodesHistory.get(peerId);
  if (!hist) {
    return {
      res: "error",
      reason: `no history found for ${peerId}`,
    };
  }
  if (hist.length === 0) {
    return {
      res: "error",
      reason: `empty history for ${peerId}`,
    };
  }

  const entry = {
    started: hist[0].started,
    ended: Date.now(),
    success: success,
    ongoing: false,
  };
  hist[0] = entry;
  rel.exitNodesHistory.set(peerId, hist);
  return { res: "ok", rel };
}

export function isEmpty({
  onlineHistory,
  exitNodesHistory,
}: Reliability): boolean {
  for (const hist of exitNodesHistory.values()) {
    if (hist.length > 0) {
      return false;
    }
  }
  return onlineHistory.length === 0;
}

export function isOnline(rel: Reliability): boolean {
  // no history - means no websocket connection, or unused for long period
  if (rel.onlineHistory.length === 0) {
    return false;
  }
  // for now only take last online state into account
  return rel.onlineHistory[0].online;
}

export function isCurrentlyFailure(
  rel: Reliability,
  exitNodeId: string
): boolean {
  const hist = rel.exitNodesHistory.get(exitNodeId);
  if (hist && hist.length > 0) {
    return !hist[0].success;
  }
  return false;
}
