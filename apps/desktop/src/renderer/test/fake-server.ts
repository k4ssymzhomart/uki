// An in-memory stand-in for the server side the sync loop talks to: ingest (insert on conflict do
// nothing, uploads for flag events with unconfirmed stills), the answers upsert (later saved_at wins),
// Storage uploads and frames. `online = false` makes every call fail like a dropped network,
// `dropReplies` makes the server store a call but lose the reply, and `failStatus` fails one kind of
// call with an HTTP status the way services/student-api.ts reports it.
import {
  type AnswerUpsert,
  type ClientEventEnvelope,
  type FramesRequest,
  type FramesResponse,
  IngestRequest,
  type IngestResponse,
  REVIEW,
  stillPath,
} from "@uki/contracts";
import type { StillGrant, SyncApi } from "../outbox/sync.ts";
import { fromHttpReply, fromPostgrestError, kindForStatus, ServiceError } from "../services/errors.ts";

type CallKind = "answers" | "ingest" | "upload" | "frames";

/** The Edge Runtime's body for 546 (Supabase "Edge Function Limits"). */
export const WORKER_LIMIT_BODY = {
  code: "WORKER_LIMIT",
  message: "Function failed due to not having enough compute resources (please check logs)",
};

/**
 * The error student-api.ts throws for a reply with this status: ingest and frames are Edge Functions
 * (fromHttpReply), the answers upsert goes through PostgREST (fromPostgrestError), uploads to Storage
 * (kindForStatus).
 */
export function replyError(kind: CallKind, status: number): ServiceError {
  if (kind === "ingest" || kind === "frames") {
    return fromHttpReply(status, status === 546 ? WORKER_LIMIT_BODY : null);
  }
  if (kind === "answers") return fromPostgrestError({ message: `HTTP ${status}` }, status);
  return new ServiceError(kindForStatus(status), "upload refused", status);
}

export interface FakeServerOptions {
  examId: string;
  now: () => number;
  endsAt?: string;
}

export class FakeServer implements SyncApi {
  online = true;
  /** Store the next N calls but fail them like a lost reply. */
  dropReplies = 0;
  /** Store the next N still uploads but fail them like a lost reply. */
  dropUploadReplies = 0;
  /** Fail every call of a kind with this HTTP status (replyError), without storing anything. */
  readonly failStatus: Partial<Record<CallKind, number>> = {};
  /** Every call in order, for ordering checks. */
  readonly calls: Array<{ kind: CallKind; at: number; size: number }> = [];
  readonly events = new Map<string, ClientEventEnvelope>();
  readonly answers = new Map<string, AnswerUpsert>();
  readonly objects = new Map<string, number>();
  readonly frames = new Map<string, string>();
  readonly statuses: unknown[] = [];
  ingestCalls = 0;
  /** session_ends_at the ingest reply reports; default an hour from now. */
  endsAt: string | null;
  private grantSerial = 0;

  constructor(private readonly options: FakeServerOptions) {
    this.endsAt = options.endsAt ?? null;
  }

  private check(kind: CallKind, size: number): void {
    this.calls.push({ kind, at: this.options.now(), size });
    if (!this.online) throw new ServiceError("network", "offline");
    const status = this.failStatus[kind];
    if (status !== undefined) throw replyError(kind, status);
  }

  private lose(): void {
    if (this.dropReplies > 0) {
      this.dropReplies -= 1;
      throw new ServiceError("network", "reply lost");
    }
  }

  async upsertAnswers(rows: AnswerUpsert[]): Promise<void> {
    this.check("answers", rows.length);
    for (const row of rows) {
      const key = `${row.session_id}/${row.question_id}`;
      const current = this.answers.get(key);
      if (!current || current.saved_at <= row.saved_at) this.answers.set(key, row);
    }
    this.lose();
  }

  async ingest(request: IngestRequest): Promise<IngestResponse> {
    this.check("ingest", request.events.length);
    const parsed = IngestRequest.parse(request);
    this.ingestCalls += 1;
    if (parsed.status) this.statuses.push(parsed.status);
    const accepted: string[] = [];
    const duplicates: string[] = [];
    const uploads: IngestResponse["uploads"] = [];
    for (const event of parsed.events) {
      if (this.events.has(event.id)) duplicates.push(event.id);
      else {
        this.events.set(event.id, event);
        accepted.push(event.id);
      }
      if (REVIEW[event.type] === "flag" && event.frame_count > 0) {
        const stills = [];
        for (let index = 0; index < event.frame_count; index += 1) {
          const path = stillPath(this.options.examId, event.session_id, event.id, index);
          if (this.frames.has(path)) continue;
          if (this.objects.has(path)) {
            // Uploaded but never confirmed: ingest confirms it and offers no URL.
            this.frames.set(path, crypto.randomUUID());
            continue;
          }
          this.grantSerial += 1;
          stills.push({
            index,
            path,
            token: `t${this.grantSerial}`,
            signed_url: `http://storage.test/${path}?token=t${this.grantSerial}`,
          });
        }
        if (stills.length > 0) uploads.push({ event_id: event.id, stills });
      }
    }
    this.lose();
    return {
      accepted,
      duplicates,
      uploads,
      session: {
        state: "writing",
        ends_at: this.endsAt ?? new Date(this.options.now() + 3_600_000).toISOString(),
        extra_min: 0,
        paused_s: 0,
      },
      server_time: new Date(this.options.now()).toISOString(),
    };
  }

  /** Like ingest's URLs, an upload creates its still once and never replaces it. */
  async uploadStill(upload: StillGrant, jpeg: Blob): Promise<void> {
    this.check("upload", 1);
    if (this.objects.has(upload.path)) {
      throw new ServiceError("conflict", "The resource already exists", 409);
    }
    this.objects.set(upload.path, jpeg.size);
    if (this.dropUploadReplies > 0) {
      this.dropUploadReplies -= 1;
      throw new ServiceError("network", "reply lost");
    }
  }

  async confirmFrames(request: FramesRequest): Promise<FramesResponse> {
    this.check("frames", request.paths.length);
    const ids: string[] = [];
    for (const path of request.paths) {
      if (!this.objects.has(path)) throw new ServiceError("not_found", `not uploaded: ${path}`, 404);
      const id = this.frames.get(path) ?? crypto.randomUUID();
      this.frames.set(path, id);
      ids.push(id);
    }
    return { frame_ids: ids };
  }

  /** Stored events of one type. */
  ofType(type: string): ClientEventEnvelope[] {
    return [...this.events.values()].filter((event) => event.type === type);
  }
}
