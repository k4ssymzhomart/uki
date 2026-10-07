// Reads and writes on the outbox database. The sync loop (sync.ts) decides when to send; this module
// only knows what is waiting and records what the server confirmed.
import { type AnswerUpsert, type ClientEventEnvelope, REVIEW, STILL, THRESHOLDS } from "@uki/contracts";
import { Dexie } from "dexie";
import type { AnswerRow, CommandRow, EventRow, OutboxDb, StillRow } from "./db.ts";

/** A still never captured (the camera stopped, the worker failed) is given up this long after its time. */
export const STILL_WAIT_MS = 20_000;

const seqKey = (sessionId: string) => `seq:${sessionId}`;
const flagsKey = (sessionId: string) => `flags:${sessionId}`;
/** Ids of the Üki Lock events queued for the session. */
const lockIdsKey = (sessionId: string) => `lock-ids:${sessionId}`;

export class Outbox {
  constructor(
    readonly db: OutboxDb,
    private readonly now: () => number = Date.now,
  ) {}

  // -------------------------------------------------------------------------------------------------
  // Answers
  // -------------------------------------------------------------------------------------------------

  /** Keeps the newest choice for the question; the sync loop upserts it. */
  async saveAnswer(sessionId: string, questionId: string, choiceId: string, savedAt: string): Promise<void> {
    await this.db.answers.put({ sessionId, questionId, choiceId, savedAt, syncedAt: null, rejectedAt: null });
  }

  async answers(sessionId: string): Promise<AnswerRow[]> {
    return this.db.answers.where("sessionId").equals(sessionId).toArray();
  }

  /** Answers the server has not taken yet, oldest first. */
  async unsyncedAnswers(sessionId: string): Promise<AnswerRow[]> {
    const rows = await this.answers(sessionId);
    return rows
      .filter((row) => row.syncedAt === null && row.rejectedAt === null)
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  }

  /** Marks rows synced, unless a newer answer replaced one while the upsert ran. */
  async markAnswers(rows: readonly AnswerUpsert[], outcome: "synced" | "rejected"): Promise<void> {
    const at = this.now();
    await this.db.transaction("rw", this.db.answers, async () => {
      for (const row of rows) {
        const current = await this.db.answers.get([row.session_id, row.question_id]);
        if (!current || current.savedAt !== row.saved_at || current.choiceId !== row.choice_id) continue;
        await this.db.answers.put(
          outcome === "synced" ? { ...current, syncedAt: at } : { ...current, rejectedAt: at },
        );
      }
    });
  }

  // -------------------------------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------------------------------

  /**
   * Queues one event with the session's next `seq`. `build` gets the seq and returns the envelope
   * (ClientEventEnvelope-checked by the caller); seq and the event are written in one transaction, so
   * the numbering survives a crash and never repeats.
   */
  async enqueueEvent(sessionId: string, build: (seq: number) => ClientEventEnvelope): Promise<EventRow> {
    return this.db.transaction("rw", this.db.events, this.db.meta, async () => {
      const meta = await this.db.meta.get(seqKey(sessionId));
      const seq = typeof meta?.value === "number" ? meta.value : 0;
      const envelope = build(seq);
      if (envelope.session_id !== sessionId) throw new Error("event belongs to another session");
      const existing = await this.db.events.get(envelope.id);
      if (existing) return existing;
      const flag = REVIEW[envelope.type] === "flag";
      const row: EventRow = {
        id: envelope.id,
        sessionId,
        seq,
        envelope,
        flag,
        createdAt: this.now(),
        sentAt: null,
        storedAt: null,
        confirmed: [],
        rejectedAt: null,
      };
      await this.db.events.add(row);
      await this.db.meta.put({ key: seqKey(sessionId), value: seq + 1 });
      if (flag) {
        const flags = await this.db.meta.get(flagsKey(sessionId));
        await this.db.meta.put({
          key: flagsKey(sessionId),
          value: (typeof flags?.value === "number" ? flags.value : 0) + 1,
        });
      }
      return row;
    });
  }

  /**
   * Queues an event from Üki Lock, like enqueueEvent. The Lock sends its whole outbox again on every
   * new link, with the same ids: an event this session already queued (and perhaps stored and deleted
   * since) is not queued or counted again, and the result is null.
   */
  async enqueueLockEvent(
    sessionId: string,
    build: (seq: number) => ClientEventEnvelope,
  ): Promise<EventRow | null> {
    return this.db.transaction("rw", this.db.events, this.db.meta, async () => {
      const { id } = build(await this.nextSeq(sessionId));
      const seen = await this.db.meta.get(lockIdsKey(sessionId));
      const ids: unknown[] = Array.isArray(seen?.value) ? seen.value : [];
      if (ids.includes(id)) return null;
      await this.db.meta.put({ key: lockIdsKey(sessionId), value: [...ids, id] });
      return this.enqueueEvent(sessionId, build);
    });
  }

  /** The next seq the session will use. */
  async nextSeq(sessionId: string): Promise<number> {
    const meta = await this.db.meta.get(seqKey(sessionId));
    return typeof meta?.value === "number" ? meta.value : 0;
  }

  /** Flag events this laptop recorded for the session (3.1 done.flags.value). */
  async flagCount(sessionId: string): Promise<number> {
    const meta = await this.db.meta.get(flagsKey(sessionId));
    return typeof meta?.value === "number" ? meta.value : 0;
  }

  /** Events not yet stored on the server, in seq order. */
  async unsentEvents(sessionId: string, limit: number = THRESHOLDS.outbox.maxBatch): Promise<EventRow[]> {
    const rows = await this.db.events
      .where("[sessionId+seq]")
      .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
      .toArray();
    return rows.filter((row) => row.storedAt === null && row.rejectedAt === null).slice(0, limit);
  }

  async event(id: string): Promise<EventRow | undefined> {
    return this.db.events.get(id);
  }

  async markSent(ids: readonly string[]): Promise<void> {
    const at = this.now();
    await this.db.events
      .where("id")
      .anyOf([...ids])
      .modify({ sentAt: at });
  }

  /**
   * Records the events ingest stored (accepted or duplicate). An event with no stills to wait for is
   * deleted at once; a flag event with stills stays until they are confirmed or given up.
   */
  async markStored(ids: readonly string[]): Promise<void> {
    const at = this.now();
    await this.db.transaction("rw", this.db.events, this.db.stills, async () => {
      for (const id of ids) {
        const row = await this.db.events.get(id);
        if (!row) continue;
        const stored = { ...row, storedAt: row.storedAt ?? at };
        if (await this.isSettled(stored)) await this.db.events.delete(id);
        else await this.db.events.put(stored);
      }
    });
  }

  async markRejected(id: string): Promise<void> {
    await this.db.events.update(id, { rejectedAt: this.now() });
  }

  /** Unsent events plus unsynced answers: `queued` of net.offline, and the empty check. */
  async queuedCount(sessionId: string): Promise<number> {
    const [events, answers] = await Promise.all([
      this.unsentEvents(sessionId, Number.MAX_SAFE_INTEGER),
      this.unsyncedAnswers(sessionId),
    ]);
    return events.length + answers.length;
  }

  // -------------------------------------------------------------------------------------------------
  // Stills
  // -------------------------------------------------------------------------------------------------

  async addStill(input: {
    sessionId: string;
    eventId: string;
    index: number;
    at: number;
    bytes: ArrayBuffer;
  }): Promise<void> {
    if (!Number.isInteger(input.index) || input.index < 0 || input.index >= STILL.maxCount) return;
    const id = `${input.eventId}-${input.index}`;
    const existing = await this.db.stills.get(id);
    if (existing) return;
    const event = await this.db.events.get(input.eventId);
    if (event?.confirmed.includes(input.index)) return;
    await this.db.stills.put({
      id,
      eventId: input.eventId,
      sessionId: input.sessionId,
      index: input.index,
      at: input.at,
      bytes: input.bytes,
      state: "pending",
      path: null,
    });
  }

  async stillsFor(eventId: string): Promise<StillRow[]> {
    return this.db.stills.where("eventId").equals(eventId).toArray();
  }

  async sessionStills(sessionId: string): Promise<StillRow[]> {
    return this.db.stills.where("sessionId").equals(sessionId).toArray();
  }

  async markStillUploaded(id: string, path: string): Promise<void> {
    await this.db.stills.update(id, { state: "uploaded", path });
  }

  /** `frames` confirmed these stills: delete the laptop copies, and the event once it is settled. */
  async confirmStills(eventId: string, indexes: readonly number[]): Promise<void> {
    await this.db.transaction("rw", this.db.events, this.db.stills, async () => {
      for (const index of indexes) await this.db.stills.delete(`${eventId}-${index}`);
      const row = await this.db.events.get(eventId);
      if (!row) return;
      const confirmed = [...new Set([...row.confirmed, ...indexes])].sort();
      const next = { ...row, confirmed };
      if (await this.isSettled(next)) await this.db.events.delete(eventId);
      else await this.db.events.put(next);
    });
  }

  /**
   * Stored flag events that still need a still uploaded. `withoutGrant` filters to those whose waiting
   * stills have no upload URL, so the next ingest resends them for fresh ones.
   */
  async eventsAwaitingStills(sessionId: string): Promise<EventRow[]> {
    const rows = await this.db.events.where("sessionId").equals(sessionId).toArray();
    return rows
      .filter((row) => row.storedAt !== null && row.rejectedAt === null)
      .sort((a, b) => a.seq - b.seq);
  }

  /** Deletes stored events whose stills are all confirmed or given up (call after time passes). */
  async settle(sessionId: string): Promise<void> {
    await this.db.transaction("rw", this.db.events, this.db.stills, async () => {
      const rows = await this.db.events.where("sessionId").equals(sessionId).toArray();
      for (const row of rows) {
        if (row.storedAt !== null && (await this.isSettled(row))) await this.db.events.delete(row.id);
      }
    });
  }

  /**
   * True when nothing more is owed for the event: it carries no stills, or every still index is
   * confirmed, or never captured and past STILL_WAIT_MS.
   */
  private async isSettled(row: EventRow): Promise<boolean> {
    if (row.storedAt === null) return false;
    const count = Math.min(row.envelope.frame_count, STILL.maxCount);
    if (count === 0) return true;
    const stills = await this.db.stills.where("eventId").equals(row.id).toArray();
    const at = Date.parse(row.envelope.at);
    for (let index = 0; index < count; index += 1) {
      if (row.confirmed.includes(index)) continue;
      if (stills.some((still) => still.index === index)) return false;
      const due = at + (THRESHOLDS.stills.offsetsMs[index] ?? 0) + STILL_WAIT_MS;
      if (this.now() < due) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------------------------------

  async command(id: string): Promise<CommandRow | undefined> {
    return this.db.commands.get(id);
  }

  async recordCommand(row: CommandRow): Promise<void> {
    await this.db.commands.put(row);
  }

  async markCommandAcked(id: string): Promise<void> {
    await this.db.commands.update(id, { ackedAt: this.now() });
  }

  async commands(sessionId: string): Promise<CommandRow[]> {
    return this.db.commands.where("sessionId").equals(sessionId).toArray();
  }

  // -------------------------------------------------------------------------------------------------
  // Meta and lifecycle
  // -------------------------------------------------------------------------------------------------

  async getMeta<T>(key: string, parse: (value: unknown) => T | null): Promise<T | null> {
    const row = await this.db.meta.get(key);
    return row === undefined ? null : parse(row.value);
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  async deleteMeta(key: string): Promise<void> {
    await this.db.meta.delete(key);
  }

  /** Nothing waits for the server: no unsynced answer, no event, no still. */
  async isEmpty(sessionId: string): Promise<boolean> {
    const [answers, events, stills] = await Promise.all([
      this.unsyncedAnswers(sessionId),
      this.db.events.where("sessionId").equals(sessionId).count(),
      this.db.stills.where("sessionId").equals(sessionId).count(),
    ]);
    return answers.length === 0 && events === 0 && stills === 0;
  }

  /** Removes everything: after the receipt shows and the outbox is empty. */
  async clear(): Promise<void> {
    await this.db.transaction(
      "rw",
      [this.db.answers, this.db.events, this.db.stills, this.db.commands, this.db.meta],
      async () => {
        await Promise.all([
          this.db.answers.clear(),
          this.db.events.clear(),
          this.db.stills.clear(),
          this.db.commands.clear(),
          this.db.meta.clear(),
        ]);
      },
    );
  }
}
