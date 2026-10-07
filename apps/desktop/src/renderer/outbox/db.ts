// The laptop's outbox ("Offline queue" in docs/phase-0-plan.md): a Dexie 4 database in IndexedDB that
// holds answers, events, stills and applied commands until the server confirms them. Nothing leaves
// it before that; after the receipt shows and the outbox is empty, the whole database is cleared.
import type { ClientEventEnvelope, CommandType } from "@uki/contracts";
import { Dexie, type EntityTable, type Table } from "dexie";

/** One answer per session and question; the later `savedAt` wins on the server too. */
export interface AnswerRow {
  sessionId: string;
  questionId: string;
  choiceId: string;
  /** ISO timestamp on the laptop clock, sent as `saved_at`. */
  savedAt: string;
  /** Laptop ms when the server took this exact `savedAt`; null while it waits. */
  syncedAt: number | null;
  /** Laptop ms when the server refused it for good (for example past the session's end). */
  rejectedAt: number | null;
}

/** One event envelope (UUIDv7 id) and its delivery state. */
export interface EventRow {
  id: string;
  sessionId: string;
  /** Per session, from 0, increasing by 1; survives restarts (meta `seq:<session>`). */
  seq: number;
  envelope: ClientEventEnvelope;
  /** REVIEW says flag: flush at once and count it for the receipt. */
  flag: boolean;
  /** Laptop ms when the event was queued. */
  createdAt: number;
  /** Laptop ms of the last ingest call that carried it. */
  sentAt: number | null;
  /** Laptop ms when ingest reported it accepted or duplicate. */
  storedAt: number | null;
  /** Still indexes `frames` confirmed. */
  confirmed: number[];
  /** Laptop ms when ingest refused this one event for good (400 on a batch of one). */
  rejectedAt: number | null;
}

/** One flagged still, a 640 × 360 JPEG, until `frames` confirms it. */
export interface StillRow {
  /** `<eventId>-<index>`. */
  id: string;
  eventId: string;
  sessionId: string;
  index: number;
  /** Laptop ms when the frame was taken. */
  at: number;
  /** The JPEG bytes (an ArrayBuffer clones into IndexedDB everywhere; a Blob is made for the upload). */
  bytes: ArrayBuffer;
  /** `pending` until uploaded to Storage, then `uploaded` until `frames` confirms it. */
  state: "pending" | "uploaded";
  /** The Storage path it was uploaded to. */
  path: string | null;
}

/** A proctor command this laptop applied, so each one runs once. */
export interface CommandRow {
  id: string;
  sessionId: string;
  type: CommandType;
  /** The command's payload as received (checked with Command when it arrived). */
  payload: unknown;
  /** Server ms of `issued_at`. */
  issuedAt: number;
  /** The issuing staff member's name, when the broadcast carried it. */
  byName: string | null;
  /** Laptop ms. */
  appliedAt: number;
  /** Laptop ms when `acked_at` was written; null until then. */
  ackedAt: number | null;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export const OUTBOX_DB_NAME = "uki-outbox";

export class OutboxDb extends Dexie {
  answers!: Table<AnswerRow, [string, string]>;
  events!: EntityTable<EventRow, "id">;
  stills!: EntityTable<StillRow, "id">;
  commands!: EntityTable<CommandRow, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name: string = OUTBOX_DB_NAME) {
    super(name);
    this.version(1).stores({
      answers: "[sessionId+questionId], sessionId",
      events: "id, sessionId, [sessionId+seq]",
      stills: "id, eventId, sessionId",
      commands: "id, sessionId",
      meta: "key",
    });
  }
}
