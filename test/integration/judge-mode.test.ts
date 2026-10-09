// Judge mode end to end on the local stack (docs/runbooks/judge-mode.md):
//   `pnpm judge:setup` makes DEMO-LIVE, its roster, its checks (no Lock, no card, phones at 0.55) and the
//   judge account, twice without a change;
//   simulated students (apps/judge-sim) sign in anonymously, join, check in, heartbeat and play episodes
//   with stills through ingest and frames, with the publishable key only;
//   the judge (observer) reads the wall, the stills and the report, and every write is refused, the
//   command function included;
//   demo_live_tick rolls DEMO-LIVE over, demo-live-purge deletes the orphaned stills through the Storage
//   API, and the same anonymous user joins the new run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseApi } from "../../apps/judge-sim/src/api.ts";
import { type EpisodePlan, type EpisodeStep, planEpisode } from "../../apps/judge-sim/src/episodes.ts";
import { loadStills, stillsDir } from "../../apps/judge-sim/src/main.ts";
import { createRng } from "../../apps/judge-sim/src/rng.ts";
import { StateStore } from "../../apps/judge-sim/src/state.ts";
import { SimStudent } from "../../apps/judge-sim/src/student.ts";
import {
  DEMO_LIVE_CODE,
  DemoLivePurgeOutput,
  DemoLiveStatus,
  FRAMES_BUCKET,
  JUDGE_EMAIL,
  uuidv7,
} from "../../packages/contracts/src/index.ts";
import { createUkiClient, type UkiClient } from "../../packages/db/src/index.ts";
import { call } from "./api.ts";
import { ROOT } from "./stack.ts";
import { adminClient, stack } from "./world.ts";

const scratch = mkdtempSync(join(tmpdir(), "uki-judge-it-"));
const envFile = join(scratch, "judge.env");
const onePager = join(scratch, "one-pager.md");
const NUMBERS = ["20249001", "20249002"];

let examId = "";
let judge: UkiClient;
let judgeToken = "";
const students: SimStudent[] = [];
const createdUsers: string[] = [];

function setup(): string {
  return execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/judge-setup.ts", "--env-file", envFile, "--one-pager", onePager, "--yes"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 },
  );
}

/** A plan's step, or a failure naming the plan. */
function stepOf(plan: EpisodePlan, index = 0): EpisodeStep {
  const step = plan.steps[index];
  if (step === undefined) throw new Error(`${plan.kind} has no step ${index}`);
  return step;
}

function password(): string {
  const line = readFileSync(envFile, "utf8")
    .split("\n")
    .find((l) => l.startsWith("JUDGE_PASSWORD="));
  if (line === undefined) throw new Error("no JUDGE_PASSWORD in the env file");
  return line.slice("JUDGE_PASSWORD=".length).trim();
}

async function demoExam() {
  const { data, error } = await adminClient()
    .from("exams")
    .select("id, status, starts_at, duration_min, title, checks")
    .eq("code", DEMO_LIVE_CODE)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function purge(): Promise<{ status: number; body: unknown }> {
  const { apiUrl, secretKey } = stack();
  // The function runtime may start the new function on its first call: give it a minute.
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${apiUrl}/functions/v1/demo-live-purge`, {
      method: "POST",
      headers: { apikey: secretKey, "content-type": "application/json" },
      body: "{}",
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.status < 500 || attempt >= 20) return { status: response.status, body };
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

beforeAll(async () => {
  const { apiUrl, publishableKey, secretKey } = stack();
  writeFileSync(envFile, `SUPABASE_URL=${apiUrl}\nSUPABASE_SECRET_KEY=${secretKey}\n`);
  setup();
  examId = (await demoExam()).id;

  judge = createUkiClient(apiUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await judge.auth.signInWithPassword({ email: JUDGE_EMAIL, password: password() });
  if (signedIn.error || !signedIn.data.session) throw new Error(`judge sign-in: ${signedIn.error?.message}`);
  judgeToken = signedIn.data.session.access_token;

  const api = new SupabaseApi({ url: apiUrl, publishableKey });
  const store = new StateStore(join(scratch, "state"));
  store.init();
  const stills = loadStills(stillsDir(join(ROOT, "apps", "judge-sim", "src")));
  for (const [i, number] of NUMBERS.entries()) {
    const student = new SimStudent(number, i / NUMBERS.length, {
      api,
      store,
      stills,
      serverNow: () => Date.now(),
      observeServerTime: () => {},
    });
    const auth = await api.signInAnonymously(Date.now());
    createdUsers.push(auth.user_id);
    student.adoptAuth(auth);
    students.push(student);
  }
}, 180_000);

afterAll(async () => {
  const admin = adminClient();
  try {
    if (examId !== "") {
      // One more rollover clears the run's sessions, so the exam itself can go.
      const old = new Date(Date.now() - 700 * 60_000).toISOString();
      await admin.from("exams").update({ starts_at: old }).eq("id", examId);
      await admin.rpc("demo_live_tick");
      await admin.from("exams").delete().eq("id", examId);
    }
    const judgeRow = await admin.from("staff").select("id").eq("role", "observer");
    for (const row of judgeRow.data ?? []) {
      await admin.from("proctor_assignments").delete().eq("staff_id", row.id);
      await admin.auth.admin.deleteUser(row.id);
    }
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 120_000);

describe("judge setup", () => {
  it("makes DEMO-LIVE live for 720 minutes with 30 students and 20 questions", async () => {
    const exam = await demoExam();
    expect(exam).toMatchObject({ status: "live", duration_min: 720, title: "Demo · Live" });
    expect(exam.checks).toMatchObject({ lock: false, identity: false, phone_score: 0.55 });
    const admin = adminClient();
    const roster = await admin.from("exam_students").select("seat").eq("exam_id", examId);
    expect(roster.data).toHaveLength(30);
    const questions = await admin.from("exam_questions").select("position").eq("exam_id", examId);
    expect(questions.data).toHaveLength(20);
  });

  it("is idempotent: a second run keeps the exam, the run, the questions and the password", async () => {
    const before = await demoExam();
    const pw = password();
    // Checks changed by hand: the three DEMO-LIVE checks come back, every other key is kept.
    const tuned = { ...(before.checks as Record<string, unknown>), gaze_s: 3, lock: true, phone_score: 0.85 };
    await adminClient().from("exams").update({ checks: tuned }).eq("id", before.id);
    setup();
    const after = await demoExam();
    expect(after.id).toBe(before.id);
    expect(after.starts_at).toBe(before.starts_at);
    expect(after.checks).toMatchObject({ gaze_s: 3, lock: false, identity: false, phone_score: 0.55 });
    expect(password()).toBe(pw);
    const questions = await adminClient().from("exam_questions").select("position").eq("exam_id", examId);
    expect(questions.data).toHaveLength(20);
    // A second run keeps the judge's password, so a judge who is signed in stays signed in.
    const user = await judge.auth.getUser();
    expect(user.error).toBeNull();
    expect(user.data.user?.email).toBe(JUDGE_EMAIL);
  });

  it("writes the one-pager with the password, outside the repository, and prints no password", () => {
    expect(existsSync(onePager)).toBe(true);
    expect(readFileSync(onePager, "utf8")).toContain(`| Password | ${password()} |`);
    expect(setup()).not.toContain(password());
  });

  it("makes the judge an observer of DEMO-LIVE only", async () => {
    const exams = await judge.from("exams").select("code");
    expect(exams.data).toEqual([{ code: DEMO_LIVE_CODE }]);
    const me = await judge
      .from("staff")
      .select("role")
      .eq("id", (await judge.auth.getUser()).data.user?.id ?? "");
    expect(me.data).toEqual([{ role: "observer" }]);
  });
});

describe("simulated students with the publishable key", () => {
  it("join, check in and write; heartbeats keep them seen", async () => {
    const run = { id: examId, startsAt: (await demoExam()).starts_at };
    for (const student of students) {
      expect(await student.join(DEMO_LIVE_CODE, run, Date.now())).toBe("joined");
      const checkIn = await student.send(student.checkInStep(0.9), Date.now(), true);
      expect(checkIn.ok).toBe(true);
      expect(student.state).toBe("writing");
    }
    const sessions = await adminClient()
      .from("sessions")
      .select("state, last_seen_at, rules_accepted_at")
      .eq("exam_id", examId);
    expect(sessions.data).toHaveLength(NUMBERS.length);
    for (const row of sessions.data ?? []) {
      expect(row.state).toBe("writing");
      expect(row.rules_accepted_at).not.toBeNull();
    }
    const first = students[0] as SimStudent;
    expect(await first.heartbeat(Date.now())).toBe(true);
  });

  it("play episodes: a raised phone with two stills, an empty seat, Ask proctor", async () => {
    const student = students[0] as SimStudent;
    const ctx = {
      gazeS: 2,
      faceMissingS: 10,
      locale: student.locale,
      next: student.nextQuestion(),
      questionCount: 20,
    };
    const phone = planEpisode("phone_raised", createRng(1), ctx);
    expect((await student.send(stepOf(phone), Date.now())).stills).toBe(2);
    const absent = planEpisode("absent", createRng(2), ctx);
    for (const step of absent.steps) expect((await student.send(step, Date.now())).ok).toBe(true);
    expect((await student.send(stepOf(planEpisode("ask_proctor", createRng(3), ctx)), Date.now())).ok).toBe(
      true,
    );
    const answer = planEpisode("answer", createRng(4), ctx);
    expect((await student.send(stepOf(answer), Date.now())).ok).toBe(true);

    const admin = adminClient();
    const flag = await admin
      .from("events")
      .select("id, review, frame_count")
      .eq("session_id", student.file.session_id as string)
      .eq("type", "phone.detected")
      .single();
    expect(flag.data).toMatchObject({ review: "flag", frame_count: 2 });
    const frames = await admin
      .from("frames")
      .select("storage_path")
      .eq("event_id", flag.data?.id as string);
    expect(frames.data).toHaveLength(2);
    const help = await admin
      .from("help_requests")
      .select("topic")
      .eq("session_id", student.file.session_id as string);
    expect(help.data).toHaveLength(1);
    const answers = await admin
      .from("answers")
      .select("question_id")
      .eq("session_id", student.file.session_id as string);
    expect(answers.data).toHaveLength(1);
    const session = await admin
      .from("sessions")
      .select("state")
      .eq("id", student.file.session_id as string)
      .single();
    expect(session.data?.state).toBe("writing");
  });

  it("read demo_live_status, which counts the judge's open wall", async () => {
    const student = students[0] as SimStudent;
    const api = new SupabaseApi({ url: stack().apiUrl, publishableKey: stack().publishableKey });
    const before = await api.rpc("demo_live_status", {}, student.token() as string, DemoLiveStatus);
    expect(before.exam?.id).toBe(examId);
    const seen = await judge.rpc("demo_live_seen", { exam_id: examId });
    expect(seen.error).toBeNull();
    const after = await api.rpc("demo_live_status", {}, student.token() as string, DemoLiveStatus);
    expect(after.viewers).toBe(before.viewers + 1);
  });
});

describe("the judge reads and never writes", () => {
  it("reads the wall's sessions, opens the stills and the report, each read audited", async () => {
    const admin = adminClient();
    const student = students[0] as SimStudent;
    const sessions = await judge.from("sessions").select("id").eq("exam_id", examId);
    expect(sessions.data).toHaveLength(NUMBERS.length);
    const flag = await judge
      .from("events")
      .select("id")
      .eq("session_id", student.file.session_id as string)
      .eq("type", "phone.detected")
      .single();
    const stills = await call("stills", { event_id: flag.data?.id }, judgeToken);
    expect(stills.status).toBe(200);
    expect((stills.body as { urls: unknown[] }).urls).toHaveLength(2);
    const report = await judge.rpc("get_report", { session_id: student.file.session_id as string });
    expect(report.error).toBeNull();
    const judgeId = (await judge.auth.getUser()).data.user?.id as string;
    const audit = await admin.from("audit_log").select("action").eq("actor_id", judgeId);
    const actions = (audit.data ?? []).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["still.viewed", "report.view"]));
  });

  it("is refused every write: commands, notes, decisions, replies, shares, seats", async () => {
    const student = students[1] as SimStudent;
    const sessionId = student.file.session_id as string;
    const command = await call(
      "command",
      {
        session_id: sessionId,
        type: "message",
        payload: { text: "Hello", scope: "student" },
        request_id: uuidv7(),
      },
      judgeToken,
    );
    expect(command.status).toBe(403);
    const pause = await call(
      "command",
      { session_id: sessionId, type: "pause", payload: {}, request_id: uuidv7() },
      judgeToken,
    );
    expect(pause.status).toBe(403);
    const refusals = await Promise.all([
      judge.rpc("add_session_note", { session_id: sessionId, text: "A note" }),
      judge.rpc("decide_session", { session_id: sessionId, decision: "no_issue" }),
      judge.rpc("confirm_seats", { exam_id: examId }),
      judge.rpc("start_exam", { exam_id: examId }),
    ]);
    for (const result of refusals) expect(result.error?.message).toBe("forbidden");
    const help = await adminClient()
      .from("help_requests")
      .select("id")
      .eq("exam_id", examId)
      .limit(1)
      .single();
    const close = await judge.rpc("close_help_request", { id: help.data?.id as string, reply: "Yes" });
    expect(close.error?.message).toBe("forbidden");
    const report = await adminClient().from("reports").select("id").eq("exam_id", examId).limit(1).single();
    const share = await judge.rpc("create_share", { report_id: report.data?.id as string });
    expect(share.error?.message).toBe("forbidden");
    const commands = await adminClient().from("session_commands").select("id").eq("session_id", sessionId);
    expect(commands.data).toEqual([]);
  });
});

describe("the rollover", () => {
  it("deletes the run, demo-live-purge removes its stills through Storage, and the same users join again", async () => {
    const admin = adminClient();
    const student = students[0] as SimStudent;
    const oldSession = student.file.session_id as string;
    const prefix = `${examId}/${oldSession}`;
    const stored = await admin.storage.from(FRAMES_BUCKET).list(prefix);
    expect(stored.data?.length).toBeGreaterThanOrEqual(2);

    const old = new Date(Date.now() - 700 * 60_000).toISOString();
    expect((await admin.from("exams").update({ starts_at: old }).eq("id", examId)).error).toBeNull();
    const tick = await admin.rpc("demo_live_tick");
    expect(tick.error).toBeNull();
    expect((tick.data as { rolled: boolean }).rolled).toBe(true);
    const left = await admin.from("sessions").select("id").eq("exam_id", examId);
    expect(left.data).toEqual([]);

    const orphans = await admin.rpc("demo_live_orphans");
    expect((orphans.data ?? []).length).toBeGreaterThanOrEqual(2);
    const purged = await purge();
    expect(purged.status).toBe(200);
    const result = DemoLivePurgeOutput.parse(purged.body);
    expect(result.removed).toBe(result.listed);
    expect(result.removed).toBeGreaterThanOrEqual(2);
    const after = await admin.storage.from(FRAMES_BUCKET).list(prefix);
    expect(after.data ?? []).toEqual([]);

    expect(await student.heartbeat(Date.now())).toBe(false);
    expect(student.joined).toBe(false);
    const run = { id: examId, startsAt: (await demoExam()).starts_at };
    expect(await student.join(DEMO_LIVE_CODE, run, Date.now())).toBe("joined");
    expect(student.file.session_id).not.toBe(oldSession);
    const session = await admin
      .from("sessions")
      .select("auth_uid")
      .eq("id", student.file.session_id as string)
      .single();
    expect(session.data?.auth_uid).toBe(student.file.auth?.user_id);
  });

  it("a purge without orphans removes nothing", async () => {
    const purged = await purge();
    expect(purged.status).toBe(200);
    expect(DemoLivePurgeOutput.parse(purged.body)).toEqual({ listed: 0, removed: 0 });
    const status = await adminClient().from("exams").select("status").eq("id", examId).single();
    expect(status.data?.status).toBe("live");
  });
});
