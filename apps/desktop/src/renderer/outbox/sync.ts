// The sync loop ("Offline queue" in docs/phase-0-plan.md):
// 1. After each answer and every 2 s, upsert unsynced answers, then send up to 50 events to ingest in
//    seq order; a flag event flushes at once. Ingest is called at least every 10 s, with an empty
//    batch if needed, carrying the session status; the next run is never later than that heartbeat.
// 2. A failed call retries after 2, 4, 8, 16, then every 30 s. With no reply for 5 s the app is
//    offline (2.1a); the next successful call ends it and queues net.offline {offline_ms, queued}
//    before that call's events, so on reconnect answers go first, then events in seq order.
// 3. Stills upload to the signed URLs from ingest, frames confirms them, then the laptop copy is
//    deleted. A still with no valid URL gets a fresh one by resending its event (a duplicate). A URL
//    creates its still once: "already exists" means an earlier upload went through, and a still the
//    reply offers no URL for is confirmed on the server already.
// 4. Nothing leaves the outbox before the server confirms it.
import {
  type AnswerUpsert,
  type FramesRequest,
  type FramesResponse,
  type IngestRequest,
  type IngestResponse,
  type IngestStatus,
  retryDelayMs,
  STILL,
  STILL_UPLOAD_URL_TTL_S,
  THRESHOLDS,
} from "@uki/contracts";
import { type ServiceError, toServiceError } from "../services/errors.ts";
import type { EventRow, StillRow } from "./db.ts";
import type { Outbox } from "./outbox.ts";

/** The server calls the loop makes; services/student-api.ts implements them over supabase-js. */
export interface SyncApi {
  upsertAnswers(rows: AnswerUpsert[]): Promise<void>;
  ingest(request: IngestRequest): Promise<IngestResponse>;
  uploadStill(upload: StillGrant, jpeg: Blob): Promise<void>;
  confirmFrames(request: FramesRequest): Promise<FramesResponse>;
}

/** A signed upload for one still, from an ingest reply. */
export interface StillGrant {
  path: string;
  token: string;
  signedUrl: string;
  /** Laptop ms after which the URL is treated as expired. */
  expiresAt: number;
}

export interface SyncReply {
  response: IngestResponse;
  /** Laptop ms when the call was sent and answered, for the clock offset. */
  sentAt: number;
  receivedAt: number;
}

export interface Connectivity {
  offline: boolean;
  /** Laptop ms since when no reply came; null when online. */
  since: number | null;
}

export interface SyncLoopOptions {
  api: SyncApi;
  outbox: Outbox;
  sessionId: string;
  /** The status ingest writes to sessions.status; read before every call. */
  getStatus?: () => IngestStatus | undefined;
  onReply?: (reply: SyncReply) => void;
  onConnectivity?: (state: Connectivity) => void;
  /**
   * The first successful call after an offline spell, before its events are read: queue net.offline
   * here so it goes out in this call.
   */
  onReconnect?: (info: { offlineMs: number; queued: number }) => Promise<void> | void;
  /** The server refused the session for good (403, 404): the loop stops. */
  onFatal?: (error: ServiceError) => void;
  /** Laptop clock, default Date.now. */
  now?: () => number;
}

/** A grant is not used in its last minute. */
const GRANT_MARGIN_MS = 60_000;

export class SyncLoop {
  private readonly api: SyncApi;
  private readonly outbox: Outbox;
  private readonly sessionId: string;
  private readonly now: () => number;
  private readonly options: SyncLoopOptions;

  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;
  private again = false;
  /** nudge() came while a run was in flight: try once more right after it, whatever its outcome. */
  private nudged = false;

  /** Consecutive failed runs; 0 when the last run worked. */
  private attempt = 0;
  private backoffUntil = 0;
  /** Laptop ms the current failure streak began (the send time of its first failed run). */
  private failingSince: number | null = null;
  private inFlightSince: number | null = null;
  private offlineShown = false;

  private lastIngestAt = Number.NEGATIVE_INFINITY;
  private lastStatusKey: string | null = null;
  /** 50, or 1 after ingest refused a batch, to find the one bad event. */
  private batchLimit: number = THRESHOLDS.outbox.maxBatch;
  private readonly grants = new Map<string, StillGrant>();

  constructor(options: SyncLoopOptions) {
    this.options = options;
    this.api = options.api;
    this.outbox = options.outbox;
    this.sessionId = options.sessionId;
    this.now = options.now ?? Date.now;
  }

  /** Starts the loop: a run now, then every 2 s. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.trigger();
  }

  stop(): void {
    this.started = false;
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.offlineTimer !== null) clearTimeout(this.offlineTimer);
    this.timer = null;
    this.offlineTimer = null;
  }

  get isStarted(): boolean {
    return this.started;
  }

  get connectivity(): Connectivity {
    return { offline: this.offlineShown, since: this.offlineShown ? this.failingSince : null };
  }

  /** After an answer or any new event: run now, unless a failure's backoff is running. */
  kick(): void {
    if (!this.started || this.attempt > 0) return;
    this.trigger();
  }

  /** A flag event: send at once. The backoff still applies while calls fail. */
  flushNow(): void {
    this.kick();
  }

  /** The OS says the network is back: skip the rest of the backoff and try now. */
  nudge(): void {
    if (!this.started) return;
    this.backoffUntil = 0;
    if (this.running) this.nudged = true;
    this.trigger(true);
  }

  /**
   * The OS says the network went away (the window's offline event): call ingest now instead of at the
   * next heartbeat, up to 10 s later, so 2.1a shows 5 s after the cut and net.offline measures it all.
   */
  probe(): void {
    if (!this.started) return;
    this.lastIngestAt = Number.NEGATIVE_INFINITY;
    this.trigger(true);
  }

  /**
   * One run now, ignoring the backoff (submit and end). Resolves true when the run worked and no
   * answer or event is left to send.
   */
  async flush(): Promise<boolean> {
    if (this.running) await this.running;
    const ok = await this.runOnce();
    if (!ok) return false;
    return (await this.outbox.queuedCount(this.sessionId)) === 0;
  }

  // -------------------------------------------------------------------------------------------------

  private trigger(ignoreBackoff = false): void {
    if (!this.started) return;
    if (this.running) {
      this.again = true;
      return;
    }
    if (!ignoreBackoff && this.attempt > 0 && this.now() < this.backoffUntil) {
      this.schedule();
      return;
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    void this.runOnce().then(() => {
      if (this.nudged) {
        // The run that was in flight may have started before the network came back.
        this.nudged = false;
        this.again = false;
        this.trigger(true);
      } else if (this.again && this.attempt === 0) {
        this.again = false;
        this.trigger();
      } else {
        this.again = false;
        this.schedule();
      }
    });
  }

  private schedule(): void {
    if (!this.started) return;
    if (this.timer !== null) clearTimeout(this.timer);
    const delay = this.attempt > 0 ? Math.max(0, this.backoffUntil - this.now()) : this.untilNextRun();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.trigger();
    }, delay);
  }

  /**
   * The flush interval, or less when the heartbeat falls due sooner. Each 2 s tick counts from the end
   * of the run before it, so slow runs shift the ticks; checked only on them, the heartbeat slipped by
   * up to a tick (12 s instead of 10 on a loaded laptop), and so did a command whose broadcast was lost
   * and that only an ingest reply could bring (P.10).
   */
  private untilNextRun(): number {
    const interval = THRESHOLDS.outbox.flushIntervalMs;
    const untilHeartbeat = this.lastIngestAt + THRESHOLDS.outbox.ingestHeartbeatMs - this.now();
    if (!Number.isFinite(untilHeartbeat)) return interval;
    return Math.max(0, Math.min(interval, untilHeartbeat));
  }

  private runOnce(): Promise<boolean> {
    if (this.running) return this.running;
    const run = this.run().finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  private async run(): Promise<boolean> {
    const startedAt = this.now();
    this.inFlightSince = startedAt;
    this.armOfflineCheck(this.failingSince ?? startedAt);
    let batch: EventRow[] = [];
    try {
      const queuedBefore = this.offlineShown ? await this.outbox.queuedCount(this.sessionId) : 0;
      let reconnected = false;

      const answers = await this.outbox.unsyncedAnswers(this.sessionId);
      if (answers.length > 0) {
        const rows: AnswerUpsert[] = answers.map((row) => ({
          session_id: row.sessionId,
          question_id: row.questionId,
          choice_id: row.choiceId,
          saved_at: row.savedAt,
        }));
        try {
          await this.api.upsertAnswers(rows);
          await this.outbox.markAnswers(rows, "synced");
        } catch (error) {
          const failure = toServiceError(error);
          if (failure.retryable) throw failure;
          // One refused row fails the whole statement: find it by sending them one at a time.
          if (rows.length > 1) await this.upsertEach(rows);
          else await this.outbox.markAnswers(rows, "rejected");
        }
        reconnected = await this.endOffline(queuedBefore);
      }

      const unsent = await this.outbox.unsentEvents(this.sessionId, this.batchLimit);
      const resend = await this.stillResends(Math.max(0, this.batchLimit - unsent.length));
      const status = this.options.getStatus?.();
      const statusKey = JSON.stringify(status ?? null);
      const heartbeatDue = this.now() - this.lastIngestAt >= THRESHOLDS.outbox.ingestHeartbeatMs;
      if (
        unsent.length > 0 ||
        resend.length > 0 ||
        statusKey !== this.lastStatusKey ||
        heartbeatDue ||
        this.offlineShown
      ) {
        // An offline spell that ends with this call queues net.offline before the batch is read.
        if (this.offlineShown && !reconnected) {
          batch = await this.sendIngest(status, statusKey, unsent, resend, queuedBefore);
        } else {
          batch = await this.sendIngest(status, statusKey, unsent, resend, null);
        }
      }

      await this.uploadStills();
      await this.outbox.settle(this.sessionId);
      this.succeeded();
      // A full batch means more may wait: drain at once rather than every 2 s.
      if (unsent.length >= this.batchLimit) this.again = true;
      return true;
    } catch (error) {
      const failure = toServiceError(error);
      await this.failed(failure, startedAt, batch);
      return false;
    } finally {
      this.inFlightSince = null;
    }
  }

  /**
   * One ingest call. When `reconnectQueued` is set the call is the first reply after an offline
   * spell: it is sent with the events read before, and net.offline follows in the next run (it is
   * queued here, after the reply proves the network is back).
   */
  private async sendIngest(
    status: IngestStatus | undefined,
    statusKey: string,
    unsent: EventRow[],
    resend: EventRow[],
    reconnectQueued: number | null,
  ): Promise<EventRow[]> {
    const events = [...unsent, ...resend].sort((a, b) => a.seq - b.seq);
    const request: IngestRequest = {
      session_id: this.sessionId,
      events: events.map((row) => row.envelope),
      ...(status ? { status } : {}),
    };
    if (unsent.length > 0) await this.outbox.markSent(unsent.map((row) => row.id));
    const sentAt = this.now();
    let response: IngestResponse;
    try {
      response = await this.api.ingest(request);
    } catch (error) {
      throw Object.assign(toServiceError(error), { batchSize: events.length });
    }
    const receivedAt = this.now();
    this.lastIngestAt = receivedAt;
    this.lastStatusKey = statusKey;
    this.batchLimit = THRESHOLDS.outbox.maxBatch;
    await this.outbox.markStored([...response.accepted, ...response.duplicates]);
    for (const upload of response.uploads) {
      for (const still of upload.stills) {
        this.grants.set(`${upload.event_id}-${still.index}`, {
          path: still.path,
          token: still.token,
          signedUrl: still.signed_url,
          expiresAt: receivedAt + STILL_UPLOAD_URL_TTL_S * 1000 - GRANT_MARGIN_MS,
        });
      }
    }
    await this.confirmUnoffered(events, response);
    this.options.onReply?.({ response, sentAt, receivedAt });
    if (reconnectQueued !== null) await this.endOffline(reconnectQueued);
    return events;
  }

  /**
   * Answers one at a time, after the server refused a batch. A row refused for good (saved at or after
   * the session's end, not this student's question) is kept and never resent; the others are synced.
   */
  private async upsertEach(rows: readonly AnswerUpsert[]): Promise<void> {
    for (const row of rows) {
      try {
        await this.api.upsertAnswers([row]);
        await this.outbox.markAnswers([row], "synced");
      } catch (error) {
        const failure = toServiceError(error);
        if (failure.retryable) throw failure;
        await this.outbox.markAnswers([row], "rejected");
      }
    }
  }

  /** Ends an offline spell after a successful call; true when one ended. */
  private async endOffline(queued: number): Promise<boolean> {
    if (!this.offlineShown) {
      this.failingSince = null;
      return false;
    }
    const since = this.failingSince ?? this.now();
    const offlineMs = Math.max(0, Math.round(this.now() - since));
    this.offlineShown = false;
    this.failingSince = null;
    this.options.onConnectivity?.({ offline: false, since: null });
    await this.options.onReconnect?.({ offlineMs, queued });
    // net.offline was just queued: send it with the next run, at once.
    this.again = true;
    return true;
  }

  /** Stored flag events with a waiting still and no usable upload URL: resend them for fresh ones. */
  private async stillResends(limit: number): Promise<EventRow[]> {
    if (limit <= 0) return [];
    const now = this.now();
    const stills = await this.outbox.sessionStills(this.sessionId);
    const needing = new Set<string>();
    for (const still of stills) {
      if (still.state !== "pending") continue;
      const grant = this.grants.get(still.id);
      if (!grant || grant.expiresAt <= now) needing.add(still.eventId);
    }
    if (needing.size === 0) return [];
    const stored = await this.outbox.eventsAwaitingStills(this.sessionId);
    return stored.filter((row) => needing.has(row.id) && row.envelope.frame_count > 0).slice(0, limit);
  }

  /**
   * Ingest offers upload URLs for exactly the stills of a stored flag event that the server lacks. A
   * waiting still it does not offer is confirmed there already (ingest confirms a still whose upload
   * went through unseen, before a restart lost its URL): the laptop copy is done with.
   */
  private async confirmUnoffered(events: readonly EventRow[], response: IngestResponse): Promise<void> {
    const stored = new Set([...response.accepted, ...response.duplicates]);
    for (const row of events) {
      if (!row.flag || row.envelope.frame_count === 0 || !stored.has(row.id)) continue;
      const offered = new Set(
        response.uploads.find((upload) => upload.event_id === row.id)?.stills.map((still) => still.index),
      );
      const taken = (await this.outbox.stillsFor(row.id))
        .filter((still) => still.state === "pending" && !offered.has(still.index))
        .map((still) => still.index);
      if (taken.length === 0) continue;
      await this.outbox.confirmStills(row.id, taken);
      for (const index of taken) this.grants.delete(`${row.id}-${index}`);
    }
  }

  private async uploadStills(): Promise<void> {
    const now = this.now();
    const stills = await this.outbox.sessionStills(this.sessionId);
    for (const still of stills) {
      if (still.state !== "pending") continue;
      const grant = this.grants.get(still.id);
      if (!grant || grant.expiresAt <= now) continue;
      const event = await this.outbox.event(still.eventId);
      if (!event || event.storedAt === null) continue;
      try {
        await this.api.uploadStill(grant, new Blob([still.bytes], { type: STILL.mimeType }));
        await this.outbox.markStillUploaded(still.id, grant.path);
      } catch (error) {
        const failure = toServiceError(error);
        if (failure.kind === "network" || failure.kind === "rate_limited") throw failure;
        if (failure.kind === "conflict") {
          // Already in Storage: an earlier upload went through and only its reply was lost (a URL
          // creates its still once). frames confirms what is there.
          await this.outbox.markStillUploaded(still.id, grant.path);
          continue;
        }
        // Expired or refused: drop the URL; the event is resent for a fresh one.
        this.grants.delete(still.id);
      }
    }
    await this.confirmUploaded();
  }

  private async confirmUploaded(): Promise<void> {
    const stills = await this.outbox.sessionStills(this.sessionId);
    const byEvent = new Map<string, StillRow[]>();
    for (const still of stills) {
      if (still.state !== "uploaded" || still.path === null) continue;
      const list = byEvent.get(still.eventId) ?? [];
      list.push(still);
      byEvent.set(still.eventId, list);
    }
    for (const [eventId, list] of byEvent) {
      list.sort((a, b) => a.index - b.index);
      try {
        await this.api.confirmFrames({ event_id: eventId, paths: list.map((still) => still.path ?? "") });
      } catch (error) {
        const failure = toServiceError(error);
        if (failure.retryable) throw failure;
        // The object is missing (a lost upload): upload it again with a fresh URL.
        for (const still of list) {
          this.grants.delete(still.id);
          await this.outbox.db.stills.update(still.id, { state: "pending", path: null });
        }
        continue;
      }
      await this.outbox.confirmStills(
        eventId,
        list.map((still) => still.index),
      );
      for (const still of list) this.grants.delete(still.id);
    }
  }

  private succeeded(): void {
    this.attempt = 0;
    this.backoffUntil = 0;
    if (!this.offlineShown) this.failingSince = null;
    if (this.offlineTimer !== null && !this.offlineShown) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
    }
  }

  private async failed(failure: ServiceError, startedAt: number, batch: EventRow[]): Promise<void> {
    const batchSize = (failure as ServiceError & { batchSize?: number }).batchSize ?? batch.length;
    if (failure.kind === "forbidden" || failure.kind === "not_found") {
      this.stop();
      this.options.onFatal?.(failure);
      return;
    }
    if (failure.kind === "bad_request" && batchSize > 0) {
      // ingest refuses a whole batch for one bad event: narrow down to one, then set that one aside.
      if (this.batchLimit > 1) {
        this.batchLimit = 1;
      } else {
        const [first] = await this.outbox.unsentEvents(this.sessionId, 1);
        if (first) await this.outbox.markRejected(first.id);
      }
      this.attempt = 0;
      this.again = true;
      return;
    }
    this.attempt += 1;
    this.backoffUntil = this.now() + retryDelayMs(this.attempt - 1);
    if (this.failingSince === null) this.failingSince = startedAt;
    this.armOfflineCheck(this.failingSince);
  }

  /** Shows 2.1a once a call has waited, or calls have failed, for 5 s. */
  private armOfflineCheck(since: number): void {
    if (this.offlineShown || !this.started) return;
    if (this.offlineTimer !== null) clearTimeout(this.offlineTimer);
    const due = since + THRESHOLDS.outbox.offlineBannerMs - this.now();
    this.offlineTimer = setTimeout(
      () => {
        this.offlineTimer = null;
        this.checkOffline();
      },
      Math.max(0, due),
    );
  }

  private checkOffline(): void {
    if (this.offlineShown || !this.started) return;
    const now = this.now();
    const waiting =
      this.inFlightSince !== null && now - this.inFlightSince >= THRESHOLDS.outbox.offlineBannerMs;
    const failing =
      this.failingSince !== null && now - this.failingSince >= THRESHOLDS.outbox.offlineBannerMs;
    if (!waiting && !failing) {
      const since = this.failingSince ?? this.inFlightSince;
      if (since !== null) this.armOfflineCheck(since);
      return;
    }
    if (this.failingSince === null) this.failingSince = this.inFlightSince ?? now;
    this.offlineShown = true;
    this.options.onConnectivity?.({ offline: true, since: this.failingSince });
  }
}
