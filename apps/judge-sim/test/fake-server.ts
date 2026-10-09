// An in-memory stand-in for the Supabase calls the simulator makes (SimApi), with the database rules
// that matter to it: one anonymous user per sign-up, single-use refresh tokens, join_exam's
// already_joined, a rollover that deletes every session, and ingest's state steps and still uploads.
import type {
  DemoLiveStatus,
  FramesResponse,
  IngestRequestInput,
  IngestResponse,
  JoinExamOutput,
} from "@uki/contracts";
import type { z } from "zod";
import { ApiError, type SimApi } from "../src/api.ts";
import type { StoredAuth } from "../src/state.ts";

interface Session {
  id: string;
  uid: string;
  number: string;
  state: "joined" | "writing" | "paused";
  lastSeenMs: number | null;
}

export class FakeServer implements SimApi {
  signUps = 0;
  refreshes = 0;
  joins = 0;
  heartbeats = 0;
  events: { number: string; type: string; frames: number; data: Record<string, unknown> }[] = [];
  uploads: string[] = [];
  confirmed: string[] = [];
  answers = 0;
  viewers = 0;
  examStatus: "live" | "cancelled" = "live";
  startsAt = "2026-10-12T09:00:00.000000+00:00";
  readonly examId = "0192a6e0-0000-7000-8000-00000000e000";
  private sessions = new Map<string, Session>();
  private tokens = new Map<string, string>();
  private refreshTokens = new Map<string, string>();
  private n = 0;

  constructor(private readonly now: () => number) {}

  private id(prefix: string): string {
    this.n += 1;
    return `0192a6e0-0000-7000-8000-${prefix}${String(this.n).padStart(12 - prefix.length, "0")}`;
  }

  private issue(uid: string): StoredAuth {
    this.n += 1;
    const access = `access-${uid}-${this.n}`;
    const refresh = `refresh-${uid}-${this.n}`;
    this.tokens.set(access, uid);
    this.refreshTokens.set(refresh, uid);
    return {
      user_id: uid,
      access_token: access,
      refresh_token: refresh,
      expires_at: Math.floor(this.now() / 1000) + 3600,
    };
  }

  private uid(token: string): string {
    const uid = this.tokens.get(token);
    if (uid === undefined) throw new ApiError(401, null, "bad token");
    return uid;
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }

  /** Revokes every refresh token of the user (as a reuse would). */
  revoke(uid: string): void {
    for (const [token, owner] of this.refreshTokens) if (owner === uid) this.refreshTokens.delete(token);
  }

  rollover(): void {
    this.sessions.clear();
    this.startsAt = new Date(this.now()).toISOString();
  }

  sessionOf(number: string): Session | undefined {
    return [...this.sessions.values()].find((s) => s.number === number);
  }

  async signInAnonymously(): Promise<StoredAuth> {
    this.signUps += 1;
    return this.issue(this.id("aa"));
  }

  async refresh(refreshToken: string): Promise<StoredAuth> {
    const uid = this.refreshTokens.get(refreshToken);
    if (uid === undefined) throw new ApiError(400, "refresh_token_not_found", "invalid refresh token");
    this.refreshTokens.delete(refreshToken);
    this.refreshes += 1;
    return this.issue(uid);
  }

  async rpc<S extends z.ZodType>(name: string, args: Record<string, unknown>, token: string, schema: S) {
    const uid = this.uid(token);
    if (name === "demo_live_status") {
      const status: DemoLiveStatus = {
        exam: { id: this.examId, status: this.examStatus, starts_at: this.startsAt, ends_at: this.startsAt },
        viewers: this.viewers,
        server_time: this.iso(),
      };
      return schema.parse(status) as z.output<S>;
    }
    if (name === "session_heartbeat") {
      const session = this.sessions.get(String(args.session_id));
      if (session === undefined) throw new ApiError(404, "not_found", "not_found");
      if (session.uid !== uid) throw new ApiError(403, "forbidden", "forbidden");
      session.lastSeenMs = this.now();
      this.heartbeats += 1;
      return schema.parse({
        state: session.state,
        last_seen_at: this.iso(),
        ends_at: this.iso(),
        server_time: this.iso(),
      }) as z.output<S>;
    }
    throw new Error(`fake rpc ${name}`);
  }

  async joinExam(args: { code: string; student_number: string }, token: string): Promise<JoinExamOutput> {
    const uid = this.uid(token);
    if (this.examStatus !== "live") throw new ApiError(400, "invalid_code", "invalid_code");
    let session = this.sessionOf(args.student_number);
    if (session !== undefined && session.uid !== uid)
      throw new ApiError(409, "already_joined", "already_joined");
    if ([...this.sessions.values()].some((s) => s.uid === uid && s.number !== args.student_number)) {
      throw new ApiError(409, "already_joined", "already_joined");
    }
    if (session === undefined) {
      session = { id: this.id("bb"), uid, number: args.student_number, state: "joined", lastSeenMs: null };
      this.sessions.set(session.id, session);
    }
    this.joins += 1;
    const at = this.iso();
    return {
      session: {
        id: session.id,
        state: session.state,
        locale: "kk",
        started_at: null,
        extra_min: 0,
        paused_s: 0,
      },
      exam: {
        id: this.examId,
        title: "Demo · Live",
        course: "Demo",
        kind: "Live demo",
        mode: "app",
        starts_at: this.startsAt,
        duration_min: 720,
        lobby_opens_at: this.startsAt,
        status: "live",
        checks: { gaze_s: 2, phone_score: 0.55, face_missing_s: 10, identity: false, lock: false },
        lms_url: null,
        lms_done_path: null,
        allowed_sites: [],
      },
      student: { id: this.id("cc"), full_name: "Demo Student", student_number: args.student_number },
      proctor_name: null,
      questions: [1, 2, 3].map((position) => ({
        id: `0192a6e0-0000-7000-8000-00000000f00${position}`,
        position,
        body: { kk: "?", ru: "?", en: "?" },
        choices: [{ id: "a", body: { kk: "a", ru: "a", en: "a" } }],
      })),
      server_time: at,
    };
  }

  async ingest(request: IngestRequestInput, token: string): Promise<IngestResponse> {
    const uid = this.uid(token);
    const session = this.sessions.get(request.session_id);
    if (session === undefined) throw new ApiError(404, "not_found", "not_found");
    if (session.uid !== uid) throw new ApiError(403, "forbidden", "forbidden");
    const uploads: IngestResponse["uploads"] = [];
    for (const event of request.events) {
      this.events.push({
        number: session.number,
        type: event.type,
        frames: event.frame_count ?? 0,
        data: event.data,
      });
      if (event.type === "exam.started" || event.type === "session.resumed") session.state = "writing";
      if (event.type === "session.paused") session.state = "paused";
      const frames = event.frame_count ?? 0;
      if (frames > 0) {
        uploads.push({
          event_id: event.id,
          stills: Array.from({ length: frames }, (_, index) => ({
            index,
            path: `${this.examId}/${session.id}/${event.id}-${index}.jpg`,
            token: "t",
            signed_url: `https://x.supabase.co/storage/v1/object/upload/sign/frames/${event.id}-${index}.jpg?token=t`,
          })),
        });
      }
    }
    session.lastSeenMs = this.now();
    return {
      accepted: request.events.map((e) => e.id),
      duplicates: [],
      uploads,
      session: { state: session.state, ends_at: this.iso(), extra_min: 0, paused_s: 0 },
      pending_commands: [],
      server_time: this.iso(),
    };
  }

  async confirmFrames(_eventId: string, paths: string[]): Promise<FramesResponse> {
    this.confirmed.push(...paths);
    return { frame_ids: paths.map(() => this.id("dd")) };
  }

  async upload(signedUrl: string, bytes: Uint8Array): Promise<void> {
    if (bytes.length === 0) throw new Error("empty still");
    this.uploads.push(signedUrl);
  }

  async saveAnswer(): Promise<void> {
    this.answers += 1;
  }
}
