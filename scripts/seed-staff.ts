// Creates or updates the four KRU staff accounts from "Demo script and seed data" in
// docs/phase-0-plan.md, with their staff rows and proctor assignments. Idempotent: run it after every
// `supabase db reset` (local) or once after loading seed.sql (cloud).
//
// Reads SUPABASE_URL, SUPABASE_SECRET_KEY and SEED_STAFF_PASSWORD from the repository's .env. The
// password is never printed.
//
//   pnpm seed:staff
import { config } from "dotenv";
import { z } from "zod";
import { createUkiAdminClient } from "../packages/db/src/admin.ts";
import type { Enums, TablesInsert, UkiClient } from "../packages/db/src/index.ts";

config({ path: new URL("../.env", import.meta.url).pathname, quiet: true });

const Env = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
  SEED_STAFF_PASSWORD: z.string().min(8),
});

interface Assignment {
  examCode: string;
  seatFrom: number | null;
  seatTo: number | null;
  isLead: boolean;
}

interface StaffSeed {
  email: string;
  fullName: string;
  role: Enums<"staff_role">;
  faculty: string;
  languages: Enums<"locale">[];
  assignment?: Assignment;
}

const WORKSPACE_SLUG = "kru";

// The Seed staff table. Gulnara's languages and lead flag are not in the plan: she is Physics 1's only
// proctor, so she leads it, and every staff member defaults to Russian.
const STAFF: readonly StaffSeed[] = [
  {
    email: "dana.akhmetova@kru.test",
    fullName: "Dana Akhmetova",
    role: "exam_office",
    faculty: "Faculty of Mathematics",
    languages: ["ru"],
  },
  {
    email: "aigerim.sadykova@kru.test",
    fullName: "Aigerim Sadykova",
    role: "proctor",
    faculty: "Faculty of Mathematics",
    languages: ["kk", "ru"],
    assignment: { examCode: "MATH2-204-FRI", seatFrom: 1, seatTo: 64, isLead: true },
  },
  {
    email: "nurlan.bekov@kru.test",
    fullName: "Nurlan Bekov",
    role: "proctor",
    faculty: "Faculty of Mathematics",
    languages: ["ru", "en"],
    assignment: { examCode: "MATH2-204-FRI", seatFrom: 65, seatTo: 128, isLead: false },
  },
  {
    email: "gulnara.kassenova@kru.test",
    fullName: "Gulnara Kassenova",
    role: "proctor",
    faculty: "Faculty of Physics",
    languages: ["ru"],
    assignment: { examCode: "PHYS1-102-FRI", seatFrom: null, seatTo: null, isLead: true },
  },
];

function fail(message: string): never {
  throw new Error(`seed-staff: ${message}`);
}

async function findUserId(admin: UkiClient, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`listing users failed: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function upsertAuthUser(admin: UkiClient, seed: StaffSeed, password: string): Promise<string> {
  const attributes = { password, email_confirm: true, user_metadata: { full_name: seed.fullName } };
  const existing = await findUserId(admin, seed.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing, attributes);
    if (error) fail(`updating ${seed.email} failed: ${error.message}`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({ email: seed.email, ...attributes });
  if (error || !data.user) fail(`creating ${seed.email} failed: ${error?.message ?? "no user returned"}`);
  return data.user.id;
}

async function main(): Promise<void> {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    fail(
      `.env is missing or invalid: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  const env = parsed.data;
  const admin = createUkiAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

  const workspace = await admin.from("workspaces").select("id").eq("slug", WORKSPACE_SLUG).maybeSingle();
  if (workspace.error) fail(`reading the workspace failed: ${workspace.error.message}`);
  if (!workspace.data) fail(`workspace "${WORKSPACE_SLUG}" not found: load supabase/seed.sql first`);
  const workspaceId = workspace.data.id;

  const faculties = await admin.from("faculties").select("id, name").eq("workspace_id", workspaceId);
  if (faculties.error) fail(`reading faculties failed: ${faculties.error.message}`);
  const facultyIds = new Map(faculties.data.map((row) => [row.name, row.id]));

  const codes = [...new Set(STAFF.flatMap((seed) => (seed.assignment ? [seed.assignment.examCode] : [])))];
  const exams = await admin
    .from("exams")
    .select("id, code")
    .eq("workspace_id", workspaceId)
    .in("code", codes);
  if (exams.error) fail(`reading exams failed: ${exams.error.message}`);
  const examIds = new Map(exams.data.map((row) => [row.code, row.id]));

  const staffRows: TablesInsert<"staff">[] = [];
  const assignmentRows: TablesInsert<"proctor_assignments">[] = [];
  let examOfficeId: string | null = null;

  for (const seed of STAFF) {
    const facultyId = facultyIds.get(seed.faculty) ?? fail(`faculty "${seed.faculty}" not found`);
    const userId = await upsertAuthUser(admin, seed, env.SEED_STAFF_PASSWORD);
    staffRows.push({
      id: userId,
      workspace_id: workspaceId,
      faculty_id: facultyId,
      full_name: seed.fullName,
      role: seed.role,
      languages: seed.languages,
    });
    if (seed.role === "exam_office" && examOfficeId === null) examOfficeId = userId;
    if (seed.assignment) {
      const examId =
        examIds.get(seed.assignment.examCode) ?? fail(`exam ${seed.assignment.examCode} not found`);
      assignmentRows.push({
        exam_id: examId,
        staff_id: userId,
        seat_from: seed.assignment.seatFrom,
        seat_to: seed.assignment.seatTo,
        languages: seed.languages,
        is_lead: seed.assignment.isLead,
      });
    }
  }

  const staff = await admin.from("staff").upsert(staffRows, { onConflict: "id" });
  if (staff.error) fail(`writing staff failed: ${staff.error.message}`);
  const assignments = await admin
    .from("proctor_assignments")
    .upsert(assignmentRows, { onConflict: "exam_id,staff_id" });
  if (assignments.error) fail(`writing proctor assignments failed: ${assignments.error.message}`);

  if (examOfficeId !== null) {
    const created = await admin
      .from("exams")
      .update({ created_by: examOfficeId })
      .eq("workspace_id", workspaceId)
      .is("created_by", null);
    if (created.error) fail(`setting exams.created_by failed: ${created.error.message}`);
  }

  for (const seed of STAFF) {
    const where = seed.assignment
      ? `${seed.assignment.examCode}${seed.assignment.seatFrom === null ? "" : ` seats ${seed.assignment.seatFrom}-${seed.assignment.seatTo}`}${seed.assignment.isLead ? ", lead" : ""}`
      : seed.faculty;
    console.log(`${seed.email.padEnd(28)} ${seed.role.padEnd(12)} ${where}`);
  }
  console.log(`${STAFF.length} staff accounts ready; the password is SEED_STAFF_PASSWORD from .env.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
