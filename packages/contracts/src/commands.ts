// Proctor commands: what the dashboard sends to the `command` Edge Function, what `session_commands`
// stores, and what `commands_broadcast` sends to `session:{session_id}`.
import { z } from "zod";
import { Timestamp, Uuid } from "./primitives.ts";

/** Mirrors the SQL enum `command_type`. */
export const COMMAND_TYPES = ["pause", "resume", "end", "message", "add_time", "start"] as const;
export const CommandType = z.enum(COMMAND_TYPES);
export type CommandType = z.infer<typeof CommandType>;

/** `start` is inserted only by `start_exam`; the `command` function never accepts it. */
export const REQUEST_COMMAND_TYPES = ["pause", "resume", "end", "message", "add_time"] as const;
export type RequestCommandType = (typeof REQUEST_COMMAND_TYPES)[number];

/**
 * The catalog's `message.preset.*` keys (packages/i18n/catalog.json). A preset travels as its key, so
 * each student reads it in their own language.
 */
export const MESSAGE_PRESETS = [
  "message.preset.time_15",
  "message.preset.phones_away",
  "message.preset.camera_view",
  "message.preset.phone_away",
] as const;
export const MessagePreset = z.enum(MESSAGE_PRESETS);
export type MessagePreset = z.infer<typeof MessagePreset>;

export const MESSAGE_TEXT_MAX = 280;
export const END_REASON_MAX = 200;
export const ADD_TIME_MIN_MINUTES = 1;
export const ADD_TIME_MAX_MINUTES = 60;
/** The three choices in 2.4c. */
export const ADD_TIME_CHOICES = [5, 10, 15] as const;

/** `student` for one session, `group` for every session of the exam. */
export const CommandScope = z.enum(["student", "group"]);
export type CommandScope = z.infer<typeof CommandScope>;

export const MessageText = z.string().trim().min(1).max(MESSAGE_TEXT_MAX);

/**
 * `pause` may carry the proctor's own words for 2.1c (`proctor_paused.body`); without them 2.1c shows
 * only the last sentence.
 */
export const PausePayload = z.strictObject({ text: MessageText.optional() });
export const ResumePayload = z.strictObject({});
export const StartPayload = z.strictObject({});
export const EndPayload = z.strictObject({ reason: z.string().trim().min(1).max(END_REASON_MAX) });
/** Exactly one of `preset` or `text`. */
export const MessagePayload = z.union([
  z.strictObject({ preset: MessagePreset, scope: CommandScope }),
  z.strictObject({ text: MessageText, scope: CommandScope }),
]);
export const AddTimePayload = z.strictObject({
  minutes: z.number().int().min(ADD_TIME_MIN_MINUTES).max(ADD_TIME_MAX_MINUTES),
  scope: CommandScope,
});

export type PausePayload = z.infer<typeof PausePayload>;
export type ResumePayload = z.infer<typeof ResumePayload>;
export type StartPayload = z.infer<typeof StartPayload>;
export type EndPayload = z.infer<typeof EndPayload>;
export type MessagePayload = z.infer<typeof MessagePayload>;
export type AddTimePayload = z.infer<typeof AddTimePayload>;

export const COMMAND_PAYLOADS = {
  pause: PausePayload,
  resume: ResumePayload,
  end: EndPayload,
  message: MessagePayload,
  add_time: AddTimePayload,
  start: StartPayload,
} as const satisfies Record<CommandType, z.ZodType>;

export type CommandPayload<T extends CommandType> = z.infer<(typeof COMMAND_PAYLOADS)[T]>;

export type ParseResult<T> = { success: true; data: T } | { success: false; error: z.ZodError };

export function parseCommandPayload<T extends CommandType>(
  type: T,
  payload: unknown,
): ParseResult<CommandPayload<T>> {
  const schema = COMMAND_PAYLOADS[type] as unknown as z.ZodType<CommandPayload<T>>;
  const result = schema.safeParse(payload);
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
}

function commandVariants<S extends z.ZodRawShape>(shape: S) {
  return [
    z.object({ ...shape, type: z.literal("pause"), payload: PausePayload }),
    z.object({ ...shape, type: z.literal("resume"), payload: ResumePayload }),
    z.object({ ...shape, type: z.literal("end"), payload: EndPayload }),
    z.object({ ...shape, type: z.literal("message"), payload: MessagePayload }),
    z.object({ ...shape, type: z.literal("add_time"), payload: AddTimePayload }),
    z.object({ ...shape, type: z.literal("start"), payload: StartPayload }),
  ] as const;
}

/** `{ type, payload }` with the payload checked against its type. */
export const Command = z.discriminatedUnion("type", commandVariants({}));
export type Command = z.infer<typeof Command>;

/** A `session_commands` row as the student app reads it (unacked commands after a reconnect). */
export const SessionCommandRow = z.discriminatedUnion(
  "type",
  commandVariants({
    id: Uuid,
    session_id: Uuid,
    exam_id: Uuid,
    issued_by: Uuid,
    issued_at: Timestamp,
    acked_at: Timestamp.nullable(),
  }),
);
export type SessionCommandRow = z.infer<typeof SessionCommandRow>;

/**
 * The `command` broadcast on `session:{session_id}`, sent by the `commands_broadcast` trigger.
 * `by_name` is the issuing staff member's `full_name`, for 2.1c, 2.1d and 2.1e.
 */
export const CommandBroadcast = z.discriminatedUnion(
  "type",
  commandVariants({
    id: Uuid,
    session_id: Uuid,
    exam_id: Uuid,
    issued_at: Timestamp,
    by_name: z.string(),
  }),
);
export type CommandBroadcast = z.infer<typeof CommandBroadcast>;
