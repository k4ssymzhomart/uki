// Runs once before the smoke test. Checks, without spending any of the 30-a-5-minutes sign-in budget,
// that the local stack answers, that `pnpm functions:serve` serves the Edge Functions (the wall's
// commands go through `command`), and that the seed and the seeded staff are in place. Each failure
// says what to run.
import { readE2eEnv } from "./support/env.ts";
import { ALL_EXAMS, EXAMS, STAFF } from "./support/seed.ts";
import { adminClient, userIdsByEmail } from "./support/supabase.ts";

/** The edge runtime restarts whenever a file under supabase/functions changes; give it time. */
const FUNCTIONS_READY_MS = 180_000;

async function status(url: string, init: RequestInit): Promise<number | null> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

async function waitForFunctions(supabaseUrl: string): Promise<void> {
  const deadline = Date.now() + FUNCTIONS_READY_MS;
  // Without a token every function answers 401, except shared-report (no credential, WP 1.9), which
  // answers an empty body with 400; anything else is a runtime still (re)starting.
  const expected = [
    ["ingest", 401],
    ["command", 401],
    ["shared-report", 400],
  ] as const;
  for (const [name, want] of expected) {
    const url = `${supabaseUrl}/functions/v1/${name}`;
    const probe = () =>
      status(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    let code = await probe();
    while (code !== want && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      code = await probe();
    }
    if (code !== want) {
      throw new Error(
        `e2e: functions/v1/${name} answered ${code ?? "nothing"} to an empty request, expected ${want}. ` +
          "Start the Edge Functions with `pnpm functions:serve` (or `pnpm dev`).",
      );
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const env = readE2eEnv();
  const health = await status(`${env.SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (health !== 200) {
    throw new Error(`e2e: ${env.SUPABASE_URL} answered ${health ?? "nothing"}. Run \`supabase start\`.`);
  }

  const admin = adminClient();
  const { data: exams, error } = await admin
    .from("exams")
    .select("id, title")
    .in(
      "id",
      ALL_EXAMS.map((exam) => exam.id),
    );
  if (error) throw new Error(`e2e: reading the seeded exams failed: ${error.message}`);
  const missing = ALL_EXAMS.filter(
    (exam) => !exams.some((row) => row.id === exam.id && row.title === exam.title),
  );
  if (missing.length > 0) {
    throw new Error(
      `e2e: seeded exams missing: ${missing.map((exam) => exam.title).join(", ")}. ` +
        "Load supabase/seed.sql (`supabase db reset` on a stack nobody else is using).",
    );
  }

  const ids = await userIdsByEmail(Object.values(STAFF));
  const absent = Object.values(STAFF).filter((email) => !ids.has(email));
  if (absent.length > 0) throw new Error(`e2e: no staff ${absent.join(", ")}. Run \`pnpm seed:staff\`.`);
  const { data: assignments, error: assignmentError } = await admin
    .from("proctor_assignments")
    .select("exam_id, staff_id, is_lead")
    .in("exam_id", [EXAMS.math2.id, EXAMS.physics1.id]);
  if (assignmentError) throw new Error(`e2e: reading assignments failed: ${assignmentError.message}`);
  const leads = (examId: string, email: string) =>
    assignments.some((row) => row.exam_id === examId && row.staff_id === ids.get(email) && row.is_lead);
  if (!leads(EXAMS.math2.id, STAFF.aigerim) || !leads(EXAMS.physics1.id, STAFF.gulnara)) {
    throw new Error("e2e: the seeded proctor assignments are missing. Run `pnpm seed:staff`.");
  }

  await waitForFunctions(env.SUPABASE_URL);
}
