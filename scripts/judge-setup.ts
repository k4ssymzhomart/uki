// `pnpm judge:setup`: judge mode's data (docs/runbooks/judge-mode.md), on the local stack or the cloud
// project. Idempotent: run it again and it only fills in what is missing.
//
// - Group DEMO and its 30 students, 20249001 to 20249030, in the KRU workspace.
// - The exam "Demo · Live" (DEMO-LIVE): an app exam, live now for 720 minutes with the lobby open, with
//   group DEMO, the 30 students on seats 1 to 30, and 20 single-choice questions copied from
//   Mathematics 2. An existing DEMO-LIVE keeps its run unless demo_live_tick would roll it over.
// - The judge's account, judge@kru.test: staff role observer, assigned to DEMO-LIVE only. Its password is
//   JUDGE_PASSWORD from the env file when set; otherwise a new random one, appended to the env file. It is
//   never printed: the one-pager (outside the repository) carries it to the judges.
//
//   pnpm judge:setup [--env-file .env.cloud] [--one-pager <path>] [--dashboard-url <url>] [--reset-password] [--yes]
//
// Uses the secret key, so it runs on your laptop, never on the VPS. A cloud target asks first unless --yes.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  DEMO_GROUP_CODE,
  DEMO_LIVE_CODE,
  DEMO_LIVE_TITLE,
  JUDGE_EMAIL,
} from "../packages/contracts/src/index.ts";
import type { TablesInsert, UkiClient } from "../packages/db/src/index.ts";
import { confirm, createLogger, must, ok, parseCli, UsageError } from "./lib/cli.ts";
import { serverClock } from "./lib/clock.ts";
import { describeTarget, isLocalUrl, loadEnvFile, readScriptEnv } from "./lib/env.ts";
import {
  appendEnvLine,
  DEFAULT_DASHBOARD_URL,
  demoLiveRun,
  demoRoster,
  generatePassword,
  isInside,
  JUDGE_NAME,
  JUDGE_PASSWORD_KEY,
  needsNewRun,
  readEnvValue,
  renderOnePager,
} from "./lib/judge.ts";
import { ROOT } from "./lib/paths.ts";
import { adminClient } from "./lib/supabase.ts";

const log = createLogger("judge:setup");

const USAGE = `Usage: pnpm judge:setup [--env-file <path>] [--one-pager <path>] [--dashboard-url <url>] [--yes]

  --env-file <p>       SUPABASE_URL and SUPABASE_SECRET_KEY; JUDGE_PASSWORD is read from and written to it
                       (default: the repository's .env)
  --one-pager <p>      where the judge one-pager goes; must be outside the repository
                       (default: uki-judge-one-pager.md next to the repository's main checkout)
  --dashboard-url <u>  the dashboard's address in the one-pager (default ${DEFAULT_DASHBOARD_URL})
  --reset-password     set JUDGE_PASSWORD on the existing judge account again (signs the judge out)
  --yes                do not ask before changing a cloud project`;

const Args = z.object({
  "env-file": z.string().optional(),
  "one-pager": z.string().optional(),
  "dashboard-url": z.url({ protocol: /^https?$/ }).default(DEFAULT_DASHBOARD_URL),
  "reset-password": z.boolean().default(false),
  yes: z.boolean().default(false),
  help: z.boolean().default(false),
});

const WORKSPACE_SLUG = "kru";
// Its own faculty, so the always-live exam never counts in a real faculty's numbers on A.1.
const FACULTY = "Demo";
const SOURCE_EXAM = "MATH2-204-FRI";
const QUESTIONS = 20;

/** The main checkout's parent (worktrees share its .git), where the one-pager goes by default. */
function defaultOnePager(): string {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    return resolve(dirname(dirname(common)), "uki-judge-one-pager.md");
  } catch {
    return resolve(ROOT, "..", "uki-judge-one-pager.md");
  }
}

async function findUser(admin: UkiClient, email: string): Promise<{ id: string; confirmed: boolean } | null> {
  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return { id: match.id, confirmed: Boolean(match.email_confirmed_at) };
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function main(): Promise<void> {
  const args = parseCli(
    process.argv.slice(2),
    {
      "env-file": { type: "string" },
      "one-pager": { type: "string" },
      "dashboard-url": { type: "string" },
      "reset-password": { type: "boolean" },
      yes: { type: "boolean" },
      help: { type: "boolean" },
    },
    Args,
  );
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const envPath =
    args["env-file"] === undefined ? resolve(ROOT, ".env") : resolve(process.cwd(), args["env-file"]);
  loadEnvFile(args["env-file"]);
  const env = readScriptEnv();
  const onePager = resolve(args["one-pager"] ?? defaultOnePager());
  if (isInside(onePager, ROOT)) {
    throw new UsageError(`--one-pager ${onePager} is inside the repository; it holds the judge's password`);
  }

  log.info(`target: ${describeTarget(env.SUPABASE_URL)}`);
  if (!isLocalUrl(env.SUPABASE_URL) && !args.yes) {
    if (!(await confirm(`Set up judge mode on the ${describeTarget(env.SUPABASE_URL)}?`))) {
      log.warn("nothing changed");
      return;
    }
  }

  const admin = adminClient(env);
  const clock = await serverClock(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  const nowMs = clock.now();

  // Workspace, faculty, group DEMO.
  const workspace = must(
    await admin.from("workspaces").select("id").eq("slug", WORKSPACE_SLUG).maybeSingle(),
    "workspace kru (load supabase/seed.sql first)",
  );
  const existingFaculty = await admin
    .from("faculties")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("name", FACULTY)
    .maybeSingle();
  if (existingFaculty.error) throw new Error(`judge:setup: ${FACULTY}: ${existingFaculty.error.message}`);
  const faculty =
    existingFaculty.data ??
    must(
      await admin.from("faculties").insert({ workspace_id: workspace.id, name: FACULTY }).select("id").single(),
      `faculty ${FACULTY}`,
    );
  const group = must(
    await admin
      .from("groups")
      .upsert(
        { workspace_id: workspace.id, faculty_id: faculty.id, code: DEMO_GROUP_CODE },
        { onConflict: "workspace_id,code" },
      )
      .select("id")
      .single(),
    "group DEMO",
  );

  // The 30 students.
  const roster = demoRoster();
  const studentRows: TablesInsert<"students">[] = roster.map((s) => ({
    workspace_id: workspace.id,
    student_number: s.number,
    full_name: s.fullName,
    group_id: group.id,
    locale: s.locale,
    email: null,
    programme: "Applied Mathematics",
    year: 2,
  }));
  const students = must(
    await admin
      .from("students")
      .upsert(studentRows, { onConflict: "workspace_id,student_number" })
      .select("id, student_number"),
    "students",
  );
  const studentIds = new Map(students.map((row) => [row.student_number, row.id]));

  // The exam.
  const office = must(
    await admin
      .from("staff")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("role", "exam_office")
      .limit(1),
    "exam office",
  )[0];
  const existing = await admin
    .from("exams")
    .select("id, status, starts_at, duration_min")
    .eq("code", DEMO_LIVE_CODE)
    .maybeSingle();
  ok(existing, "DEMO-LIVE");
  const fields = {
    workspace_id: workspace.id,
    faculty_id: faculty.id,
    title: DEMO_LIVE_TITLE,
    course: "Demo",
    kind: "Live demo",
    mode: "app" as const,
    room: "Online",
  };
  let examId: string;
  let rolled = false;
  if (existing.data === null) {
    const created = must(
      await admin
        .from("exams")
        .insert({
          ...fields,
          code: DEMO_LIVE_CODE,
          ...demoLiveRun(nowMs),
          scheduled_at: new Date(nowMs).toISOString(),
          created_by: office?.id ?? null,
        })
        .select("id")
        .single(),
      "create DEMO-LIVE",
    );
    examId = created.id;
    rolled = true;
  } else {
    examId = existing.data.id;
    rolled = needsNewRun(existing.data, nowMs);
    ok(
      await admin
        .from("exams")
        .update(rolled ? { ...fields, ...demoLiveRun(nowMs) } : fields)
        .eq("id", examId),
      "update DEMO-LIVE",
    );
  }

  ok(
    await admin
      .from("exam_groups")
      .upsert({ exam_id: examId, group_id: group.id }, { onConflict: "exam_id,group_id" }),
    "exam group",
  );
  ok(
    await admin.from("exam_students").upsert(
      roster.map((s) => ({
        exam_id: examId,
        student_id: studentIds.get(s.number) as string,
        seat: s.seat,
        invite_status: "sent",
      })),
      { onConflict: "exam_id,student_id" },
    ),
    "roster",
  );

  // 20 single-choice questions copied from Mathematics 2 (copies, so Mathematics 2 can change freely).
  const linked = must(
    await admin.from("exam_questions").select("question_id").eq("exam_id", examId),
    "DEMO-LIVE questions",
  );
  if (linked.length !== QUESTIONS) {
    const source = must(
      await admin.from("exams").select("id").eq("code", SOURCE_EXAM).maybeSingle(),
      `${SOURCE_EXAM} (the seed's Mathematics 2)`,
    );
    const originals = must(
      await admin
        .from("exam_questions")
        .select("position, questions(workspace_id, body, choices, topic)")
        .eq("exam_id", source.id)
        .order("position")
        .limit(QUESTIONS),
      "Mathematics 2 questions",
    );
    if (originals.length < QUESTIONS)
      throw new Error(`${SOURCE_EXAM} has ${originals.length} questions, not ${QUESTIONS}`);
    ok(await admin.from("exam_questions").delete().eq("exam_id", examId), "unlink old questions");
    const copies = must(
      await admin
        .from("questions")
        .insert(
          originals.map((row) => {
            const q = row.questions as unknown as TablesInsert<"questions">;
            return { workspace_id: q.workspace_id, body: q.body, choices: q.choices, topic: q.topic ?? null };
          }),
        )
        .select("id"),
      "copy questions",
    );
    ok(
      await admin
        .from("exam_questions")
        .insert(copies.map((copy, i) => ({ exam_id: examId, question_id: copy.id, position: i + 1 }))),
      "link questions",
    );
  }

  // The judge: password from the env file, or a new one written there first (never printed).
  const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  let password = readEnvValue(envText, JUDGE_PASSWORD_KEY);
  const newPassword = password === null;
  if (password === null) {
    password = generatePassword();
    writeFileSync(envPath, appendEnvLine(envText, JUDGE_PASSWORD_KEY, password), { mode: 0o600 });
  }
  // Setting a password signs the account out everywhere, so an existing judge keeps theirs unless the
  // password is new in this run or --reset-password asks for it: a second run never logs a judge out.
  const attributes = { password, email_confirm: true, user_metadata: { full_name: JUDGE_NAME } };
  const existingJudge = await findUser(admin, JUDGE_EMAIL);
  let judgeId: string;
  let passwordSet = false;
  if (existingJudge === null) {
    const { data, error } = await admin.auth.admin.createUser({ email: JUDGE_EMAIL, ...attributes });
    if (error || !data.user) throw new Error(`creating ${JUDGE_EMAIL}: ${error?.message ?? "no user"}`);
    judgeId = data.user.id;
    passwordSet = true;
  } else {
    judgeId = existingJudge.id;
    if (newPassword || args["reset-password"]) {
      const { error } = await admin.auth.admin.updateUserById(judgeId, attributes);
      if (error) throw new Error(`updating ${JUDGE_EMAIL}: ${error.message}`);
      passwordSet = true;
    } else if (!existingJudge.confirmed) {
      const { error } = await admin.auth.admin.updateUserById(judgeId, { email_confirm: true });
      if (error) throw new Error(`confirming ${JUDGE_EMAIL}: ${error.message}`);
    }
  }
  ok(
    await admin.from("staff").upsert(
      {
        id: judgeId,
        workspace_id: workspace.id,
        faculty_id: null,
        full_name: JUDGE_NAME,
        role: "observer",
        languages: ["en", "ru"],
      },
      { onConflict: "id" },
    ),
    "judge staff row",
  );
  ok(
    await admin.from("proctor_assignments").delete().eq("staff_id", judgeId).neq("exam_id", examId),
    "the judge's other assignments",
  );
  ok(
    await admin.from("proctor_assignments").upsert(
      {
        exam_id: examId,
        staff_id: judgeId,
        seat_from: null,
        seat_to: null,
        languages: ["en", "ru"],
        is_lead: false,
        confirmed_at: new Date(nowMs).toISOString(),
      },
      { onConflict: "exam_id,staff_id" },
    ),
    "the judge's assignment",
  );

  writeFileSync(
    onePager,
    renderOnePager({ dashboardUrl: args["dashboard-url"], password, generatedAt: new Date(nowMs) }),
    {
      mode: 0o600,
    },
  );
  chmodSync(onePager, 0o600);

  log.info(
    `group ${DEMO_GROUP_CODE} with ${roster.length} students (${roster[0]?.number} to ${roster.at(-1)?.number})`,
  );
  log.info(
    `${DEMO_LIVE_CODE} "${DEMO_LIVE_TITLE}" ${existing.data === null ? "created" : rolled ? "given a new run" : "kept its run"}; ` +
      `${QUESTIONS} questions; exam ${examId}`,
  );
  log.info(
    `${JUDGE_EMAIL}: observer of ${DEMO_LIVE_CODE} only; password ${newPassword ? "new, written to" : "from"} ` +
      `${JUDGE_PASSWORD_KEY} in ${envPath}${passwordSet ? "" : " (the account kept it; --reset-password sets it again)"}`,
  );
  log.info(`one-pager: ${onePager} (outside the repository; it holds the password)`);
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    log.error(error.message);
    process.stderr.write(`\n${USAGE}\n`);
    process.exit(2);
  }
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
