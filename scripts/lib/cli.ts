// Small helpers shared by the command-line scripts: argument parsing with Zod, coloured log lines,
// a yes/no prompt, and unwrapping supabase-js results.
import { createInterface } from "node:readline/promises";
import { type ParseArgsConfig, parseArgs } from "node:util";
import { z } from "zod";

export class UsageError extends Error {}

type Options = NonNullable<ParseArgsConfig["options"]>;

/**
 * Parses `argv` with node:util parseArgs (strict, no positionals), then checks the values with
 * `schema`. Throws UsageError with a readable message on any problem.
 */
export function parseCli<S extends z.ZodType>(
  argv: readonly string[],
  options: Options,
  schema: S,
): z.infer<S> {
  let values: Record<string, unknown>;
  try {
    values = parseArgs({ args: [...argv], options, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `--${issue.path.join(".")}: ${issue.message}`);
    throw new UsageError(lines.join("\n"));
  }
  return parsed.data;
}

/** A numeric flag given as a string, e.g. `--sessions 20`. */
export function numberFlag(min: number, max: number, fallback: number) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return fallback;
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || number > max) {
        ctx.addIssue({ code: "custom", message: `expected a number from ${min} to ${max}, got "${value}"` });
        return z.NEVER;
      }
      return number;
    });
}

const useColour = process.stdout.isTTY === true;

export const style = {
  bold: (text: string) => (useColour ? `\x1b[1m${text}\x1b[0m` : text),
  dim: (text: string) => (useColour ? `\x1b[2m${text}\x1b[0m` : text),
  red: (text: string) => (useColour ? `\x1b[31m${text}\x1b[0m` : text),
  green: (text: string) => (useColour ? `\x1b[32m${text}\x1b[0m` : text),
  yellow: (text: string) => (useColour ? `\x1b[33m${text}\x1b[0m` : text),
};

export function createLogger(name: string) {
  const prefix = style.bold(`[${name}]`);
  return {
    info: (line: string) => process.stdout.write(`${prefix} ${line}\n`),
    warn: (line: string) => process.stderr.write(`${prefix} ${style.yellow(line)}\n`),
    error: (line: string) => process.stderr.write(`${prefix} ${style.red(line)}\n`),
  };
}
export type Logger = ReturnType<typeof createLogger>;

/** Asks a yes/no question on the terminal; false when stdin is not a terminal. */
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

type ResultError = { message: string; code?: string; details?: string | null; hint?: string | null } | null;

/** The data of a supabase-js result, or an Error naming `what` and the PostgREST message. */
export function must<R extends { data: unknown; error: ResultError }>(
  result: R,
  what: string,
): NonNullable<R["data"]> {
  if (result.error) {
    const extra = [result.error.code, result.error.details, result.error.hint].filter(Boolean).join(" · ");
    throw new Error(`${what}: ${result.error.message}${extra ? ` (${extra})` : ""}`);
  }
  if (result.data === null || result.data === undefined) throw new Error(`${what}: no data`);
  return result.data as NonNullable<R["data"]>;
}

/** Like `must`, for calls whose data may legitimately be null (deletes without a select). */
export function ok(result: { error: ResultError }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

/** "1:05", "12:30", "1:02:03" for a duration in milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** "10:47" in Asia/Almaty, the time zone every screen shows. */
export function almatyTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}
