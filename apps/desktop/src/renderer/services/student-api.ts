// Every server call of the student app ("Endpoints" in docs/phase-0-plan.md), checked with the
// contracts' Zod schemas on the way out and on the way back. Calls time out so a dead connection
// counts as offline instead of hanging the sync loop.
import {
  AnswerUpsert,
  type CommandMessage,
  FRAMES_BUCKET,
  FramesRequest,
  FramesResponse,
  IngestRequest,
  IngestResponse,
  JOIN_ERROR_CODES,
  type JoinErrorCode,
  JoinExamInput,
  JoinExamOutput,
  matchErrorCode,
  parseSessionMessage,
  SESSION_BROADCAST,
  SessionCommandRow,
  STILL,
  SUBMIT_ERROR_CODES,
  SubmitSessionOutput,
  sessionTopic,
} from "@uki/contracts";
import type { Json, UkiClient } from "@uki/db";
import { z } from "zod";
import type { StillGrant, SyncApi } from "../outbox/sync.ts";
import { fromHttpReply, fromPostgrestError, kindForStatus, ServiceError, toServiceError } from "./errors.ts";
import { accessToken } from "./supabase.ts";

/** Every call gives up after this long and counts as no reply. */
export const CALL_TIMEOUT_MS = 15_000;
/** The 1.2 network row gives up sooner; it must reply within 1,000 ms anyway. */
export const HEALTH_TIMEOUT_MS = 5_000;

/** join_exam refused the join; `code` picks 1.1a or another message. */
export class JoinFailure extends Error {
  override readonly name = "JoinFailure";
  constructor(readonly code: JoinErrorCode) {
    super(code);
  }
}

export type RealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export interface CommandSubscription {
  /** Leaves the channel. */
  close(): void;
}

export interface StudentApi extends SyncApi {
  joinExam(input: z.input<typeof JoinExamInput>): Promise<JoinExamOutput>;
  submitSession(sessionId: string): Promise<SubmitSessionOutput>;
  /** Commands of the session with no acked_at, oldest first. */
  unackedCommands(sessionId: string): Promise<SessionCommandRow[]>;
  ackCommand(commandId: string, ackedAt: string): Promise<void>;
  /** Joins the private channel session:{id} and calls back for every valid command. */
  subscribeCommands(
    sessionId: string,
    handlers: { onCommand(command: CommandMessage): void; onStatus(status: RealtimeStatus): void },
  ): Promise<CommandSubscription>;
  /** GET /auth/v1/health round trip in ms; throws when there is no healthy reply. */
  health(): Promise<number>;
}

function timeout(ms: number = CALL_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function createStudentApi(
  client: UkiClient,
  env: { url: string; publishableKey: string },
): StudentApi {
  const base = env.url.replace(/\/+$/, "");

  async function postFunction<T>(name: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const token = await accessToken(client);
    let response: Response;
    try {
      response = await fetch(`${base}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: timeout(),
      });
    } catch (error) {
      throw toServiceError(error);
    }
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) throw fromHttpReply(response.status, json);
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      throw new ServiceError("server", `${name}: reply failed its schema`, response.status);
    return parsed.data;
  }

  return {
    async joinExam(input) {
      const args = JoinExamInput.parse(input);
      const { data, error, status } = await client
        .rpc("join_exam", { ...args, device: args.device as Json })
        .abortSignal(timeout());
      if (error) {
        const code = matchErrorCode(error, JOIN_ERROR_CODES);
        if (code) throw new JoinFailure(code);
        throw fromPostgrestError(error, status);
      }
      const parsed = JoinExamOutput.safeParse(data);
      if (!parsed.success) throw new ServiceError("server", "join_exam: reply failed its schema");
      return parsed.data;
    },

    async submitSession(sessionId) {
      const { data, error, status } = await client
        .rpc("submit_session", { session_id: z.uuid().parse(sessionId) })
        .abortSignal(timeout());
      if (error) {
        const code = matchErrorCode(error, SUBMIT_ERROR_CODES);
        if (code === "forbidden") throw new ServiceError("forbidden", code, 403);
        if (code === "not_found") throw new ServiceError("not_found", code, 404);
        throw fromPostgrestError(error, status);
      }
      const parsed = SubmitSessionOutput.safeParse(data);
      if (!parsed.success) throw new ServiceError("server", "submit_session: reply failed its schema");
      return parsed.data;
    },

    async upsertAnswers(rows) {
      const body = z.array(AnswerUpsert).parse(rows);
      const { error, status } = await client
        .from("answers")
        .upsert(body, { onConflict: "session_id,question_id", ignoreDuplicates: false })
        .abortSignal(timeout());
      if (error) throw fromPostgrestError(error, status);
    },

    async ingest(request) {
      return postFunction("ingest", IngestRequest.parse(request), IngestResponse);
    },

    async confirmFrames(request) {
      return postFunction("frames", FramesRequest.parse(request), FramesResponse);
    },

    async uploadStill(upload: StillGrant, jpeg: Blob) {
      if (jpeg.size > STILL.maxBytes) throw new ServiceError("bad_request", "still too large");
      let result: { error: unknown };
      try {
        result = await Promise.race([
          client.storage.from(FRAMES_BUCKET).uploadToSignedUrl(upload.path, upload.token, jpeg, {
            contentType: STILL.mimeType,
            upsert: true,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new ServiceError("network", "upload timed out")), CALL_TIMEOUT_MS),
          ),
        ]);
      } catch (error) {
        throw toServiceError(error);
      }
      if (result.error) {
        const error = result.error as {
          message?: string;
          status?: number | string;
          statusCode?: number | string;
        };
        const status = Number(error.status ?? error.statusCode ?? 0);
        if (!status || /fetch|network/i.test(error.message ?? "")) {
          throw new ServiceError("network", error.message ?? "upload failed");
        }
        throw new ServiceError(kindForStatus(status), error.message ?? "upload refused", status);
      }
    },

    async unackedCommands(sessionId) {
      const { data, error, status } = await client
        .from("session_commands")
        .select("id, session_id, exam_id, type, payload, issued_by, issued_at, acked_at")
        .eq("session_id", sessionId)
        .is("acked_at", null)
        .order("issued_at", { ascending: true })
        .abortSignal(timeout());
      if (error) throw fromPostgrestError(error, status);
      const rows: SessionCommandRow[] = [];
      for (const row of data ?? []) {
        const parsed = SessionCommandRow.safeParse(row);
        if (parsed.success) rows.push(parsed.data);
      }
      return rows;
    },

    async ackCommand(commandId, ackedAt) {
      const { error, status } = await client
        .from("session_commands")
        .update({ acked_at: ackedAt })
        .eq("id", commandId)
        .abortSignal(timeout());
      if (error) throw fromPostgrestError(error, status);
    },

    async subscribeCommands(sessionId, handlers) {
      await client.realtime.setAuth();
      const channel = client.channel(sessionTopic(sessionId), { config: { private: true } });
      channel.on("broadcast", { event: SESSION_BROADCAST.command }, (message) => {
        const command = parseSessionMessage(SESSION_BROADCAST.command, message.payload);
        if (command && command.session_id === sessionId) handlers.onCommand(command);
      });
      channel.subscribe((status) => handlers.onStatus(status as RealtimeStatus));
      return {
        close() {
          void client.removeChannel(channel);
        },
      };
    },

    async health() {
      const started = performance.now();
      let response: Response;
      try {
        response = await fetch(`${base}/auth/v1/health`, {
          headers: { apikey: env.publishableKey },
          cache: "no-store",
          signal: timeout(HEALTH_TIMEOUT_MS),
        });
      } catch (error) {
        throw toServiceError(error);
      }
      if (!response.ok) throw new ServiceError(kindForStatus(response.status), "health", response.status);
      await response.body?.cancel().catch(() => {});
      return Math.round(performance.now() - started);
    },
  };
}
