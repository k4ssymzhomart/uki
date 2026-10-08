import {
  type ExamDraft,
  InviteState,
  InviteStatus,
  Locale,
  ProctorAssignment,
  Uuid,
  type WorkspaceSettings,
} from "@uki/contracts";
import { createUkiTranslator } from "@uki/i18n";
import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import {
  courseSuggestions,
  examDraftFromRow,
  groupFromRow,
  parseSettings,
  sortGroups,
  type WizardGroup,
  WizardProctor,
} from "./wizard-model.ts";

/**
 * Everything the wizard pages read on the server, as the signed-in exam office member under RLS.
 * Pages call these after requireStaff(); a missing or foreign exam is null, so the page is a 404.
 */

const EXAM_COLUMNS =
  "id, workspace_id, faculty_id, title, course, kind, code, mode, starts_at, duration_min, lobby_opens_at, status, checks, lms_url, lms_done_path, allowed_sites, created_by, created_at, room, rules_locale, scheduled_at, browser_rules, exam_groups(group_id)";

export type WizardExam = { exam: ExamDraft; settings: WorkspaceSettings | null };

/** The exam with its groups and its workspace's settings (0.4's defaults and At a glance). */
export async function loadWizardExam(examId: string): Promise<WizardExam | null> {
  if (!Uuid.safeParse(examId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("exams").select(EXAM_COLUMNS).eq("id", examId).maybeSingle();
  if (error) throw new Error(`exams: ${error.message}`);
  const exam = examDraftFromRow(data);
  if (!exam) return null;
  const workspace = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", exam.workspace_id)
    .maybeSingle();
  if (workspace.error) throw new Error(`workspaces: ${workspace.error.message}`);
  return { exam, settings: parseSettings(workspace.data?.settings) };
}

/** The workspace's groups with their student counts, by code. */
export async function loadGroups(): Promise<WizardGroup[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("groups").select("id, code, students(count)");
  if (error) throw new Error(`groups: ${error.message}`);
  return sortGroups((data ?? []).flatMap((row) => groupFromRow(row) ?? []));
}

const StartRow = z.object({ starts_at: z.string(), course: z.string() });

/** 0.4's helpers: the courses the workspace already has, and the days other exams take (date picker dots). */
export async function loadDetailsContext(examId: string): Promise<{ courses: string[]; examDays: string[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("exams")
    .select("starts_at, course, status")
    .neq("id", examId)
    .in("status", ["scheduled", "live", "draft", "to_review", "reviewed"]);
  if (error) throw new Error(`exams: ${error.message}`);
  const rows = (data ?? []).flatMap((row) => {
    const parsed = StartRow.safeParse(row);
    return parsed.success ? [{ ...parsed.data, status: row.status }] : [];
  });
  return {
    courses: courseSuggestions(rows.map((row) => row.course)),
    examDays: rows
      .filter((row) => row.status === "scheduled" || row.status === "live")
      .map((row) => row.starts_at),
  };
}

/** One student on the exam's roster, with the invite that goes to them. */
export const RosterEntry = z.object({
  student_id: Uuid,
  seat: z.number().int().positive().nullable(),
  invite_status: InviteStatus.catch("pending"),
  student: z.object({
    full_name: z.string(),
    student_number: z.string(),
    email: z.string().nullable(),
    locale: Locale,
    programme: z.string().nullable(),
    year: z.number().int().nullable(),
    group: z.object({ code: z.string() }).nullable(),
  }),
  invite: z
    .object({ email: z.string(), state: InviteState, error: z.string().nullable() })
    .nullable()
    .default(null),
});
export type RosterEntry = z.infer<typeof RosterEntry>;

const InviteRow = z.object({
  student_id: Uuid,
  email: z.string(),
  state: InviteState,
  error: z.string().nullable(),
});

const AssignmentRow = z.object({
  exam_id: Uuid,
  staff_id: Uuid,
  seat_from: z.number().int().nullable(),
  seat_to: z.number().int().nullable(),
  languages: z.array(Locale),
  is_lead: z.boolean(),
  confirmed_at: z.string().nullable(),
  change_request: z.string().nullable(),
  staff: z.object({ full_name: z.string() }).nullable(),
});

function parseList<T>(schema: z.ZodType<T>, rows: readonly unknown[] | null): T[] {
  return (rows ?? []).flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The exam's proctor assignments with the proctors' names, in seat order (0.3, 0.5). */
export async function loadAssignments(examId: string): Promise<ProctorAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("proctor_assignments")
    .select(
      "exam_id, staff_id, seat_from, seat_to, languages, is_lead, confirmed_at, change_request, staff:staff(full_name)",
    )
    .eq("exam_id", examId);
  if (error) throw new Error(`proctor_assignments: ${error.message}`);
  return parseList(AssignmentRow, data)
    .flatMap((row) => {
      const parsed = ProctorAssignment.safeParse({ ...row, full_name: row.staff?.full_name ?? "" });
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => (a.seat_from ?? 0) - (b.seat_from ?? 0));
}

/** The workspace's proctors, whom 0.3's Add proctor offers. */
export async function loadProctors(): Promise<WizardProctor[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name, languages")
    .eq("role", "proctor")
    .order("full_name");
  if (error) throw new Error(`staff: ${error.message}`);
  return parseList(WizardProctor, data);
}

/**
 * The roster with each student's invite (0.3). Reading names, numbers and addresses is a read of
 * student data by staff, so it writes an audit row (`roster.view` on the exam) through audit_read.
 */
export async function loadRoster(examId: string): Promise<RosterEntry[]> {
  const supabase = await createSupabaseServerClient();
  const [roster, invites] = await Promise.all([
    supabase
      .from("exam_students")
      .select(
        "student_id, seat, invite_status, student:students(full_name, student_number, email, locale, programme, year, group:groups(code))",
      )
      .eq("exam_id", examId)
      .order("seat"),
    supabase.from("invites").select("student_id, email, state, error").eq("exam_id", examId),
  ]);
  if (roster.error) throw new Error(`exam_students: ${roster.error.message}`);
  if (invites.error) throw new Error(`invites: ${invites.error.message}`);
  const byStudent = new Map(parseList(InviteRow, invites.data).map((row) => [row.student_id, row]));
  const entries = parseList(
    RosterEntry,
    (roster.data ?? []).map((row) => ({ ...row, invite: byStudent.get(row.student_id) ?? null })),
  );
  if (entries.length > 0) {
    const audit = await supabase.rpc("audit_read", {
      action: "roster.view",
      object_type: "exam",
      object_id: examId,
    });
    if (audit.error) throw new Error(`audit_read: ${audit.error.message}`);
  }
  return entries;
}

/** How many students the roster has, without reading who they are (0.5). */
export async function loadRosterSize(examId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("exam_students")
    .select("student_id", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (error) throw new Error(`exam_students: ${error.message}`);
  return count ?? 0;
}

/**
 * The student app's own rule lines in Kazakh, Russian and English, for 0.2's Student preview: what the
 * student will read on 1.4 with this exam's gaze threshold. The dashboard itself is English or Russian.
 */
export type PreviewLines = Record<
  z.infer<typeof Locale>,
  Record<"window" | "eyes" | "phone" | "card" | "video", string>
>;

export function previewLines(gazeSeconds: number): PreviewLines {
  const lines = {} as PreviewLines;
  for (const locale of ["kk", "ru", "en"] as const) {
    const t = createUkiTranslator(locale);
    lines[locale] = {
      window: t("rules.window.body"),
      eyes: t("rules.eyes.body", { seconds: gazeSeconds }),
      phone: t("rules.phone.body"),
      card: t("identity.title"),
      video: t("rules.video.title"),
    };
  }
  return lines;
}
