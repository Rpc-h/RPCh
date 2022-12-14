/**
 * Possible `result` values.
 * @type success: we have received an honest and valid response.
 * @type dishonest: we have received a response but Kevlar says its not honest.
 * @type none: we have received no response for that request.
 */
export type Result = "success" | "dishonest" | "none";

export type ResponseMetric = {
  id: string;
  createdAt: Date;
  result: Result;
};

// ! Need to export these?
export const FRESH_NODE_THRESHOLD = 20;
export const MAX_RESPONSES = 100;

/**
 * Way to measure if the HOPRd entry node
 * we are using is reliable or not.
 */
export default class ReliabilityScore {
  // metrics should be public or private?
  public metrics = new Map<
    string,
    {
      responses: Map<string, ResponseMetric>;
      sent: number;
      updatedAt: Date;
    }
  >();

  /**
   * The score range goes from 0 to 1.
   */
  private score = new Map<string, number>();

  /**
   * Add new metric to the metrics Map.
   * @param peerId
   * @param requestId
   * @param result
   */

  public addMetric(peerId: string, requestId: string, result: Result) {
    let nodeMetrics = this.metrics.get(peerId);

    if (!nodeMetrics) {
      nodeMetrics = {
        responses: new Map<string, ResponseMetric>(),
        sent: 0,
        updatedAt: new Date(),
      };
      this.metrics.set(peerId, nodeMetrics);
    }

    nodeMetrics.sent += 1;

    nodeMetrics.responses.set(requestId, {
      id: "some-id",
      createdAt: new Date(),
      result,
    });
  }

  // Is there a better way to do this? @steve.
  private getResultsStats(peerId: string) {
    // TODO: Fix possible undefined
    const responses = Array.from(this.metrics.get(peerId)!.responses);

    const results = responses.reduce((acc, [_, response]) => {
      acc.push(response.result);
      return acc;
    }, [] as string[]);

    const success = results.filter((result) => result === "success");
    const dishonest = results.filter((result) => result === "dishonest");
    // ! is it 'none' or 'failed' hehe
    const none = results.filter((result) => result === "none");

    return {
      success: success.length,
      dishonest: dishonest.length,
      none: none.length,
    };
  }

  /**
   * Get peerId score.
   * @param peerId
   * @returns peerId score
   */
  public getScore(peerId: string) {
    if (this.metrics.has(peerId)) {
      // TODO: Fix possible undefined
      const sent = this.metrics.get(peerId)!.sent;
      const stats = this.getResultsStats(peerId);
      if (sent < FRESH_NODE_THRESHOLD) {
        this.score.set(peerId, 0.2);
      } else if (stats.dishonest > 0) {
        this.score.set(peerId, 0);
      } else {
        const score = (sent - stats.none) / sent;
        this.score.set(peerId, score);
      }
      return this.score.get(peerId);
    } else return 0;
  }

  /**
   * Get all scores
   * @returns array of objects with peerId and score
   */
  public getScores() {
    const entries = Array.from(this.metrics);
    return entries.map(([peerId]) => {
      const score = this.getScore(peerId);
      return { peerId, score };
    });
  }
}
