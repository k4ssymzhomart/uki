// The simulator's settings: command-line flags and an env file (C:\apps\uki\judge-sim.env on the VPS,
// written by deploy/vps/install.ps1). Only public values: the project URL, the publishable key, the exam
// code and the student numbers. A secret key is refused outright. Checked with Zod; problems are named,
// values never printed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { DEMO_LIVE_CODE, demoStudentNumbers, ExamCode } from "@uki/contracts";
import { z } from "zod";
import { DAILY_MESSAGE_BUDGET } from "./budget.ts";
import { LOG_DEFAULTS } from "./log.ts";

export class ConfigError extends Error {}

/** "20249001-20249024", "20249001,20249003", or a mix; eight digits each, at most 30 students. */
export function parseStudents(text: string): string[] {
  const numbers: string[] = [];
  for (const part of text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const range = /^(\d{8})\s*-\s*(\d{8})$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from || to - from >= 30) throw new ConfigError(`UKI_STUDENTS: bad range ${part}`);
      for (let n = from; n <= to; n += 1) numbers.push(String(n));
    } else if (/^\d{8}$/.test(part)) {
      numbers.push(part);
    } else {
      throw new ConfigError(`UKI_STUDENTS: "${part}" is not an 8-digit number or a range`);
    }
  }
  const unique = [...new Set(numbers)];
  if (unique.length === 0) throw new ConfigError("UKI_STUDENTS: no student numbers");
  if (unique.length > 30) throw new ConfigError("UKI_STUDENTS: at most 30 students");
  return unique;
}

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = z.preprocess(blank, z.string().optional());
/** A whole number from min to max written in the env file, or absent. */
const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => {
    const text = blank(v);
    return text === undefined ? undefined : Number(text);
  }, z.number().int().min(min).max(max).optional());

const Env = z.object({
  UKI_SUPABASE_URL: optionalText.pipe(z.url({ protocol: /^https?$/ }).optional()),
  UKI_PUBLISHABLE_KEY: optionalText.pipe(
    z
      .string()
      .refine((key) => !key.startsWith("sb_secret_"), "a secret key must never reach the simulator")
      .refine((key) => key.startsWith("sb_publishable_"), "must be the publishable key (sb_publishable_…)")
      .optional(),
  ),
  UKI_EXAM_CODE: optionalText.pipe(ExamCode.optional()),
  UKI_STUDENTS: optionalText,
  UKI_STATE_DIR: optionalText,
  UKI_LOG_DIR: optionalText,
  UKI_DAILY_MESSAGE_BUDGET: optionalInt(5000, 1_500_000),
  UKI_LOG_MAX_BYTES: optionalInt(64 * 1024, 100 * 1024 * 1024),
  UKI_LOG_FILES: optionalInt(2, 20),
  UKI_SEED: optionalInt(0, 2 ** 31),
});

export interface Config {
  dryRun: boolean;
  /** Absent only in a dry run. */
  url: string | null;
  publishableKey: string | null;
  examCode: string;
  students: string[];
  stateDir: string;
  logDir: string;
  dailyMessageBudget: number;
  logMaxBytes: number;
  logFiles: number;
  seed: number;
  /** Dry run: minutes of each cadence to plan. */
  planMinutes: number;
  envFile: string | null;
}

export const USAGE = `judge-sim: simulated students for the always-live DEMO-LIVE exam (docs/runbooks/judge-mode.md)

  node judge-sim.mjs --env-file <judge-sim.env>        run until stopped
  node judge-sim.mjs --dry-run [--env-file <file>]     print the plan and the budget; talks to nothing

  --env-file <path>     UKI_SUPABASE_URL, UKI_PUBLISHABLE_KEY, UKI_EXAM_CODE (default ${DEMO_LIVE_CODE}),
                        UKI_STUDENTS (default 20249001-20249024), UKI_STATE_DIR, UKI_LOG_DIR,
                        UKI_DAILY_MESSAGE_BUDGET (default ${DAILY_MESSAGE_BUDGET}), UKI_LOG_MAX_BYTES, UKI_LOG_FILES
  --dry-run             print the configuration, the cadence, the free-plan arithmetic and a sample plan
  --plan-minutes <n>    dry run: minutes of each cadence to plan (default 30)
  --seed <n>            random seed (default: the time; a dry run uses 1)
  --help`;

/** The default student list: the first 24 of the 30-student roster, leaving 6 numbers for people. */
export const DEFAULT_STUDENTS = demoStudentNumbers(24);

/**
 * Reads flags and the env file. `bundleDir` is where judge-sim.mjs lies: the state and logs default to
 * its parent (C:\apps\uki\state and C:\apps\uki\logs next to C:\apps\uki\judge-sim).
 */
export function readConfig(
  argv: readonly string[],
  bundleDir: string,
  env: NodeJS.ProcessEnv = process.env,
): Config | "help" {
  let values: Record<string, string | boolean | undefined>;
  try {
    values = parseArgs({
      args: [...argv],
      options: {
        "env-file": { type: "string" },
        "dry-run": { type: "boolean" },
        "plan-minutes": { type: "string" },
        seed: { type: "string" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw new ConfigError(error instanceof Error ? error.message : String(error));
  }
  if (values.help === true) return "help";

  const envFile = typeof values["env-file"] === "string" ? resolve(values["env-file"]) : null;
  const source: NodeJS.ProcessEnv = { ...env };
  if (envFile !== null) {
    let text: string;
    try {
      text = readFileSync(envFile, "utf8");
    } catch (error) {
      throw new ConfigError(
        `--env-file: cannot read ${envFile} (${error instanceof Error ? error.message : error})`,
      );
    }
    // Node's own .env parser; the file's values win over the process environment.
    Object.assign(source, parseEnv(text));
  }

  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`).join("\n"),
    );
  }
  const e = parsed.data;
  const dryRun = values["dry-run"] === true;
  if (!dryRun && (e.UKI_SUPABASE_URL === undefined || e.UKI_PUBLISHABLE_KEY === undefined)) {
    throw new ConfigError("UKI_SUPABASE_URL and UKI_PUBLISHABLE_KEY are required (pass --env-file)");
  }
  const planMinutes = values["plan-minutes"] === undefined ? 30 : Number(values["plan-minutes"]);
  if (!Number.isInteger(planMinutes) || planMinutes < 1 || planMinutes > 24 * 60) {
    throw new ConfigError("--plan-minutes: a whole number from 1 to 1440");
  }
  const seedFlag = values.seed === undefined ? undefined : Number(values.seed);
  if (seedFlag !== undefined && (!Number.isInteger(seedFlag) || seedFlag < 0)) {
    throw new ConfigError("--seed: a whole number");
  }
  const root = dirname(resolve(bundleDir));
  return {
    dryRun,
    url: e.UKI_SUPABASE_URL ?? null,
    publishableKey: e.UKI_PUBLISHABLE_KEY ?? null,
    examCode: e.UKI_EXAM_CODE ?? DEMO_LIVE_CODE,
    students: e.UKI_STUDENTS === undefined ? DEFAULT_STUDENTS : parseStudents(e.UKI_STUDENTS),
    stateDir: resolve(e.UKI_STATE_DIR ?? resolve(root, "state")),
    logDir: resolve(e.UKI_LOG_DIR ?? resolve(root, "logs")),
    dailyMessageBudget: e.UKI_DAILY_MESSAGE_BUDGET ?? DAILY_MESSAGE_BUDGET,
    logMaxBytes: e.UKI_LOG_MAX_BYTES ?? LOG_DEFAULTS.maxBytes,
    logFiles: e.UKI_LOG_FILES ?? LOG_DEFAULTS.files,
    seed: seedFlag ?? e.UKI_SEED ?? (dryRun ? 1 : Date.now() % 2 ** 31),
    planMinutes,
    envFile,
  };
}
