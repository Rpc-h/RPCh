import Request from "./request";
import Response from "./response";
import Message from "./message";
import Segment from "./segment";
import { createLogger, isExpired, areAllSegmentsPresent } from "./utils";

const { logVerbose } = createLogger(["common", "cache"]);

/**
 * A cache class which you can feed feed incoming Segments
 * and it will trigger back found Requests and Responses.
 */
export default class Cache {
  // partial segments received, keyed by segment.msgId
  private segments = new Map<
    number,
    {
      segments: Segment[];
      receivedAt: Date;
    }
  >();

  /**
   *
   * @param onRequest Triggered once a Request can be constructed
   * @param onResponse Triggered once a Response can be constructed
   */
  constructor(
    private onRequest: (request: Request) => void,
    private onResponse: (response: Response) => void
  ) {}

  /**
   * Feeds the cache with a new segment.
   * If segment completed a set of segments which can either be
   * a Request or Response it either trigger `onRequest` or `onResponse`
   * functions.
   * @param segment
   */
  public onSegment(segment: Segment): void {
    // get segment entry with matching msgId, or create a new one
    const segmentEntry = this.segments.get(segment.msgId) || {
      segments: [] as Segment[],
      receivedAt: new Date(),
    };

    if (segmentEntry.segments.find((s) => s.segmentNr === segment.segmentNr)) {
      logVerbose(
        "dropping segment, already exists",
        segment.msgId,
        segment.segmentNr
      );
      return;
    }

    segmentEntry.segments = [...segmentEntry.segments, segment];
    this.segments.set(segment.msgId, segmentEntry);
    logVerbose("stored new segment for message ID", segment.msgId);

    if (areAllSegmentsPresent(segmentEntry.segments)) {
      const message = Message.fromSegments(segmentEntry.segments);

      // remove segments
      this.segments.delete(segment.msgId);

      try {
        const req = Request.fromMessage(message);
        logVerbose("found new Request", req.id);
        this.onRequest(req);
      } catch {
        const res = Response.fromMessage(message);
        logVerbose("found new Response", res.id);
        this.onResponse(res);
      }
    }
  }

  /**
   * Given a timeout, removes expired segments.
   * @param timeout How many ms after a segment was received.
   */
  public removeExpired(timeout: number): void {
    const now = new Date();

    logVerbose("total number of segments", this.segments.size);

    for (const [id, entry] of this.segments.entries()) {
      if (isExpired(timeout, now, entry.receivedAt)) {
        logVerbose("dropping expired partial segments");
        this.segments.delete(id);
      }
    }
  }
}
