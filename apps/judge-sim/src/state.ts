// What survives a restart, under the state folder (C:\apps\uki\state on the VPS): each simulated
// student's anonymous user and refresh token, so a restart or a rollover never signs in a new anonymous
// user (the project allows about 30 a hour per IP); the sign-in ledger that paces new ones; the day's
// Realtime budget; and alive.json, which the VPS watchdog reads. Files are written whole and renamed into
// place, so a crash never leaves half a refresh token.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { SIGN_INS_PER_HOUR } from "./budget.ts";

export const StoredAuth = z.object({
  user_id: z.string().min(1),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  /** Unix seconds. */
  expires_at: z.number().int().positive(),
});
export type StoredAuth = z.infer<typeof StoredAuth>;

export const StudentFile = z.object({
  version: z.literal(1),
  number: z.string().regex(/^\d{8}$/),
  auth: StoredAuth.nullable(),
  /** The session join_exam bound to this user, and the exam run (starts_at) it belongs to. */
  session_id: z.string().nullable(),
  exam_starts_at: z.string().nullable(),
  /** The last event seq sent in this session. */
  seq: z.number().int().nonnegative(),
  /** True once the first ingest call (step ready, identity.matched, exam.started) went through. */
  checked_in: z.boolean(),
  /** The 1-based question on screen. */
  question: z.number().int().positive(),
});
export type StudentFile = z.infer<typeof StudentFile>;

export const SignInLedger = z.object({ at: z.array(z.number()) });

export function newStudentFile(number: string): StudentFile {
  return {
    version: 1,
    number,
    auth: null,
    session_id: null,
    exam_starts_at: null,
    seq: 0,
    checked_in: false,
    question: 1,
  };
}

const RENAME_TRIES = 5;

/** Writes `data` as JSON next to `path` and renames it into place (retried: Windows can hold a file briefly). */
export function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(tmp, path);
      return;
    } catch (error) {
      if (attempt >= RENAME_TRIES) {
        rmSync(tmp, { force: true });
        throw error;
      }
      const until = Date.now() + 50 * attempt;
      while (Date.now() < until) {
        // A short spin: this runs a few times a minute at most, and only when Windows holds the file.
      }
    }
  }
}

function readJson<T>(path: string, schema: z.ZodType<T>): T | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class StateStore {
  constructor(readonly dir: string) {}

  init(): void {
    mkdirSync(join(this.dir, "students"), { recursive: true });
  }

  private studentPath(number: string): string {
    return join(this.dir, "students", `${number}.json`);
  }

  loadStudent(number: string): StudentFile {
    const stored = readJson(this.studentPath(number), StudentFile);
    return stored !== null && stored.number === number ? stored : newStudentFile(number);
  }

  saveStudent(file: StudentFile): void {
    writeJsonAtomic(this.studentPath(file.number), file);
  }

  loadLedger(): number[] {
    return readJson(join(this.dir, "signins.json"), SignInLedger)?.at ?? [];
  }

  saveLedger(at: readonly number[]): void {
    writeJsonAtomic(join(this.dir, "signins.json"), { at });
  }

  loadBudget(): { day: string; spent: number } | null {
    return readJson(join(this.dir, "budget.json"), z.object({ day: z.string(), spent: z.number() }));
  }

  saveBudget(snapshot: { day: string; spent: number }): void {
    writeJsonAtomic(join(this.dir, "budget.json"), snapshot);
  }

  /** For the watchdog (deploy/vps/watchdog.ps1): written every 30 s while the loop runs. */
  saveAlive(alive: Record<string, unknown>): void {
    writeJsonAtomic(join(this.dir, "alive.json"), alive);
  }
}

/**
 * Whether a new anonymous user may be made now: at most `perHour` in the last rolling hour and none
 * within `minGapMs` of the last. Returns the ledger without entries older than a day.
 */
export function signInAllowed(
  ledger: readonly number[],
  nowMs: number,
  perHour: number = SIGN_INS_PER_HOUR,
  minGapMs = 10_000,
): { allowed: boolean; ledger: number[]; retryAtMs: number } {
  const kept = ledger.filter((at) => at > nowMs - 24 * 3_600_000 && at <= nowMs).sort((a, b) => a - b);
  const lastHour = kept.filter((at) => at > nowMs - 3_600_000);
  const last = kept.at(-1);
  if (last !== undefined && nowMs - last < minGapMs) {
    return { allowed: false, ledger: kept, retryAtMs: last + minGapMs };
  }
  if (lastHour.length >= perHour) {
    const oldest = lastHour[lastHour.length - perHour] as number;
    return { allowed: false, ledger: kept, retryAtMs: oldest + 3_600_000 };
  }
  return { allowed: true, ledger: kept, retryAtMs: nowMs };
}
