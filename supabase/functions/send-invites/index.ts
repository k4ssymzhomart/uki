// POST /functions/v1/send-invites: the invite email 0.8 to the students of one exam (Phase 1 plan,
// Edge Functions; "Invite email" and "Invite status" in Decisions).
//
// `{ exam_id }` sends every invite of the exam that has not gone out (pending or failed);
// `{ exam_id, student_ids }` sends those students' invites again (0.3's Resend, 0.3b after a fix);
// `{ exam_id, test: true }` sends 0.8 once to the signed-in staff member, in their first language,
// filled with the first student of the roster, and records nothing in `invites` (0.5).
//
// Only the exam office of the exam's workspace may call it (`is_office_of_exam`, as the caller); every
// read and write runs under the caller's row-level security. Each student's email is in their own
// language (`invites.locale`). Resend's batch endpoint takes 100 at a time. Each outcome goes into
// `invites`: `sent` with Resend's id and the time, or `failed` with Resend's message, and the
// invites_sync_status trigger copies the state into `exam_students.invite_status`. A batch Resend
// refuses fails as a whole. With UKI_EMAIL_SINK set, every email goes to that inbox instead, still
// written for its student (their name, number and language). One audit row per call records the
// read of the students' names and addresses. Reply: `{ sent, failed: [{ student_id, error }] }`.
import { z } from "zod";
import { mapLimit } from "../_shared/async.ts";
import {
  buildExamCode,
  INVITE_ERROR_MAX,
  InviteState,
  inviteBatches,
  Locale,
  type SendInvitesFailure,
  SendInvitesInput,
  SendInvitesOutput,
  Timestamp,
  Uuid,
} from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ApiContext, serveApi } from "../_shared/http.ts";
import { parseRow } from "../_shared/rows.ts";
import { deliveryAddress, type InviteConfig, readInviteConfig } from "./config.ts";
import {
  fillInvite,
  type InviteExam,
  type InviteSettings,
  type InviteStudent,
  type InviteTemplate,
  renderInviteTemplate,
} from "./email.tsx";
import { type EmailLocale, isEmailLocale } from "./messages.ts";
import { type ResendEmail, ResendError, sendResendBatch } from "./resend.ts";

/** PostgREST answers at most this many rows a request (`max_rows` in config.toml). */
const PAGE = 1000;
/** Student ids per `in.(…)` filter, so the request line stays short. */
const IDS_PER_QUERY = 100;
/** Invite rows written at once after a batch. */
const WRITE_CONCURRENCY = 8;
/** Real invites go out for these exams only: a draft has no code yet, and later ones are over. */
const SENDABLE = new Set(["scheduled", "live"]);
/** The test invite also works on a draft (0.5 comes before Schedule exam). */
const TESTABLE = new Set(["draft", "scheduled", "live"]);

const Group = z.object({ code: z.string() }).nullable();
const ExamRow = z.object({
  id: Uuid,
  workspace_id: Uuid,
  title: z.string(),
  course: z.string(),
  code: z.string().nullable(),
  status: z.string(),
  starts_at: Timestamp,
  lobby_opens_at: Timestamp,
  workspaces: z.object({ name: z.string(), timezone: z.string() }),
  exam_groups: z.array(z.object({ groups: Group })),
});
type ExamRow = z.infer<typeof ExamRow>;

const StudentRow = z.object({ full_name: z.string(), student_number: z.string(), groups: Group });

const InviteRow = z.object({
  id: Uuid,
  student_id: Uuid,
  email: z.string(),
  locale: Locale,
  state: InviteState,
  students: StudentRow,
});
type InviteRow = z.infer<typeof InviteRow>;

const StaffRow = z.object({ full_name: z.string(), languages: z.array(Locale) });
const RosterHead = z.array(z.object({ students: StudentRow }));

interface Outcome {
  invite: InviteRow;
  providerId: string | null;
  error: string | null;
}

function studentOf(row: z.infer<typeof StudentRow>): InviteStudent {
  return { name: row.full_name, number: row.student_number, group: row.groups?.code ?? null };
}

function inviteExam(exam: ExamRow): InviteExam {
  const groups = exam.exam_groups.flatMap((entry) => (entry.groups ? [entry.groups.code] : []));
  const timeZone = exam.workspaces.timezone;
  return {
    title: exam.title,
    // A draft has no code yet: the test invite shows the one schedule_exam will make (before a clash digit).
    code: exam.code ?? buildExamCode({ course: exam.course, groups, startsAt: exam.starts_at, timeZone }),
    startsAt: exam.starts_at,
    lobbyOpensAt: exam.lobby_opens_at,
    timeZone,
  };
}

function shortError(text: string): string {
  return text.length > INVITE_ERROR_MAX ? `${text.slice(0, INVITE_ERROR_MAX - 1)}…` : text;
}

async function loadExam(ctx: ApiContext, examId: string): Promise<ExamRow> {
  const { data, error } = await ctx.supabase
    .from("exams")
    .select(
      "id, workspace_id, title, course, code, status, starts_at, lobby_opens_at, workspaces(name, timezone), exam_groups(groups(code))",
    )
    .eq("id", examId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, "exams");
  if (data === null) throw new ApiFailure("not_found", "no such exam");
  return parseRow(ExamRow, data, "exams");
}

const INVITE_COLUMNS =
  "id, student_id, email, locale, state, students(full_name, student_number, groups(code))";

/** The invites to send: the ones not sent yet, or the named students' whatever their state. */
async function loadInvites(ctx: ApiContext, examId: string, studentIds: readonly string[] | undefined) {
  const base = () => ctx.supabase.from("invites").select(INVITE_COLUMNS).eq("exam_id", examId);
  const rows: InviteRow[] = [];
  const read = async (filter: (query: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await filter(base())
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw fromDatabaseError(error, "invites");
      const page = parseRow(z.array(InviteRow), data, "invites");
      rows.push(...page);
      if (page.length < PAGE) return;
    }
  };
  if (studentIds === undefined) {
    await read((query) => query.in("state", ["pending", "failed"]));
  } else {
    const unique = [...new Set(studentIds)];
    for (let start = 0; start < unique.length; start += IDS_PER_QUERY) {
      const ids = unique.slice(start, start + IDS_PER_QUERY);
      await read((query) => query.in("student_id", ids));
    }
  }
  return rows;
}

function failure(studentId: string | null, error: string): SendInvitesFailure {
  return { student_id: studentId, error: shortError(error) };
}

async function writeAudit(
  ctx: ApiContext,
  exam: ExamRow,
  action: "invites.send" | "invites.test",
  meta: Record<string, unknown>,
): Promise<void> {
  const { error } = await ctx.supabaseAdmin.from("audit_log").insert({
    workspace_id: exam.workspace_id,
    actor_id: ctx.userId,
    actor_kind: "staff",
    action,
    object_type: "exam",
    object_id: exam.id,
    meta,
  });
  if (error) throw fromDatabaseError(error, "audit_log");
}

/** Writes each outcome; a write that fails is logged, since the email has already gone. */
async function record(ctx: ApiContext, outcomes: readonly Outcome[]): Promise<void> {
  const now = new Date().toISOString();
  await mapLimit(outcomes, WRITE_CONCURRENCY, async ({ invite, providerId, error }) => {
    const change =
      error === null
        ? { state: "sent", provider_id: providerId, sent_at: now, error: null }
        : { state: "failed", provider_id: null, sent_at: null, error };
    // Matching the address too: if 0.3b changed it meanwhile, the row stays pending for the new one.
    const { error: failed } = await ctx.supabase
      .from("invites")
      .update(change)
      .eq("id", invite.id)
      .eq("email", invite.email);
    if (failed) console.error(`[send-invites] invite ${invite.id}: ${failed.message}`);
  });
}

async function sendAll(ctx: ApiContext, config: InviteConfig, exam: ExamRow, studentIds?: string[]) {
  if (!SENDABLE.has(exam.status) || exam.code === null) {
    throw new ApiFailure("conflict", `invites go out once the exam is scheduled (it is ${exam.status})`);
  }
  const invites = await loadInvites(ctx, exam.id, studentIds);
  const failed: SendInvitesFailure[] = [];
  if (studentIds !== undefined) {
    const found = new Set(invites.map((invite) => invite.student_id));
    for (const id of new Set(studentIds)) {
      if (!found.has(id)) failed.push(failure(id, "no invite for this student on the exam"));
    }
  }

  const details = inviteExam(exam);
  const settings: InviteSettings = {
    office: exam.workspaces.name,
    downloadUrl: config.downloadUrl,
    assetsUrl: config.assetsUrl,
    test: false,
  };
  const templates = new Map<string, Promise<InviteTemplate>>();
  const template = (locale: EmailLocale, withGroup: boolean) => {
    const key = `${locale}:${withGroup}`;
    let found = templates.get(key);
    if (found === undefined) {
      found = renderInviteTemplate(locale, details, withGroup, settings);
      templates.set(key, found);
    }
    return found;
  };

  let sent = 0;
  for (const batch of inviteBatches(invites)) {
    const emails: ResendEmail[] = await Promise.all(
      batch.map(async (invite) => {
        const student = studentOf(invite.students);
        const filled = fillInvite(await template(invite.locale, student.group !== null), student);
        return { from: config.from, to: [deliveryAddress(config, invite.email)], ...filled };
      }),
    );
    let outcomes: Outcome[];
    try {
      const ids = await sendResendBatch(emails, { apiKey: config.apiKey, baseUrl: config.baseUrl });
      outcomes = batch.map((invite, i) => ({ invite, providerId: ids[i] ?? null, error: null }));
      sent += batch.length;
    } catch (error) {
      if (!(error instanceof ResendError)) throw error;
      const message = shortError(error.describe());
      console.error(`[send-invites] a batch of ${batch.length} failed: ${message}`);
      outcomes = batch.map((invite) => ({ invite, providerId: null, error: message }));
      failed.push(...batch.map((invite) => failure(invite.student_id, message)));
    }
    await record(ctx, outcomes);
  }

  await writeAudit(ctx, exam, "invites.send", {
    students: invites.length,
    sent,
    failed: failed.length,
    sink: config.sink !== null,
  });
  return { sent, failed };
}

async function sendTest(ctx: ApiContext, config: InviteConfig, exam: ExamRow) {
  if (!TESTABLE.has(exam.status)) {
    throw new ApiFailure("conflict", `no test invite for an exam that is ${exam.status}`);
  }
  const staff = await ctx.supabase
    .from("staff")
    .select("full_name, languages")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (staff.error) throw fromDatabaseError(staff.error, "staff");
  if (staff.data === null) throw new ApiFailure("forbidden", "not a staff member");
  const me = parseRow(StaffRow, staff.data, "staff");
  const locale = me.languages.find(isEmailLocale) ?? "ru";

  const user = await ctx.supabaseAdmin.auth.admin.getUserById(ctx.userId);
  const address = user.data.user?.email;
  if (user.error || !address) throw new ApiFailure("bad_request", "the staff member has no email address");

  const head = await ctx.supabase
    .from("exam_students")
    .select("seat, students(full_name, student_number, groups(code))")
    .eq("exam_id", exam.id)
    .order("seat", { ascending: true, nullsFirst: false })
    .limit(1);
  if (head.error) throw fromDatabaseError(head.error, "exam_students");
  const first = parseRow(RosterHead, head.data, "exam_students")[0];
  if (first === undefined) throw new ApiFailure("conflict", "the roster is empty: import it on 0.3 first");

  const student = studentOf(first.students);
  const settings: InviteSettings = {
    office: exam.workspaces.name,
    downloadUrl: config.downloadUrl,
    assetsUrl: config.assetsUrl,
    test: true,
  };
  const filled = fillInvite(
    await renderInviteTemplate(locale, inviteExam(exam), student.group !== null, settings),
    student,
  );
  const email: ResendEmail = { from: config.from, to: [deliveryAddress(config, address)], ...filled };

  let result: { sent: number; failed: SendInvitesFailure[] };
  try {
    await sendResendBatch([email], { apiKey: config.apiKey, baseUrl: config.baseUrl });
    result = { sent: 1, failed: [] };
  } catch (error) {
    if (!(error instanceof ResendError)) throw error;
    result = { sent: 0, failed: [failure(null, error.describe())] };
  }
  await writeAudit(ctx, exam, "invites.test", { locale, sent: result.sent, sink: config.sink !== null });
  return result;
}

async function sendInvites(input: SendInvitesInput, ctx: ApiContext): Promise<SendInvitesOutput> {
  if (ctx.isAnonymous) throw new ApiFailure("forbidden", "students cannot send invites");
  const office = await ctx.supabase.rpc("is_office_of_exam", { p_exam_id: input.exam_id });
  if (office.error) throw fromDatabaseError(office.error, "is_office_of_exam");
  if (office.data !== true)
    throw new ApiFailure("forbidden", "only the exam office of the exam sends invites");

  const config = readInviteConfig((name) => Deno.env.get(name));
  const exam = await loadExam(ctx, input.exam_id);
  if ("test" in input) return sendTest(ctx, config, exam);
  return sendAll(ctx, config, exam, input.student_ids);
}

Deno.serve(
  serveApi({ name: "send-invites", input: SendInvitesInput, output: SendInvitesOutput, handle: sendInvites }),
);
