import { Uuid } from "@uki/contracts";
import type { StaffMember } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import {
  LOBBY_SESSION_COLUMNS,
  LobbyExam,
  type LobbyRole,
  LobbySession,
  parseRows,
  RosterEntry,
} from "./lobby-model.ts";

export type LobbyData = {
  exam: LobbyExam;
  roster: RosterEntry[];
  sessions: LobbySession[];
  who: LobbyRole;
};

/**
 * Everything 1.5 renders on the server, read as the staff member under RLS: the exam (with its
 * groups, from exam_overview), the roster with the students' names, the sessions and the caller's own
 * proctor assignment. Null when the id is not an exam this staff member may see.
 */
export async function loadLobby(examId: string, staff: StaffMember): Promise<LobbyData | null> {
  if (!Uuid.safeParse(examId).success) return null;
  const supabase = await createSupabaseServerClient();
  const examQuery = await supabase
    .from("exam_overview")
    .select("id, title, status, starts_at, duration_min, lobby_opens_at, groups")
    .eq("id", examId)
    .maybeSingle();
  if (examQuery.error) throw new Error(`exam_overview: ${examQuery.error.message}`);
  const exam = LobbyExam.safeParse(examQuery.data);
  if (!exam.success) return null;

  const [roster, sessions, assignment] = await Promise.all([
    supabase
      .from("exam_students")
      .select("student_id, seat, invite_status, student:students(full_name, student_number)")
      .eq("exam_id", examId),
    supabase.from("sessions").select(LOBBY_SESSION_COLUMNS).eq("exam_id", examId),
    supabase
      .from("proctor_assignments")
      .select("is_lead")
      .eq("exam_id", examId)
      .eq("staff_id", staff.id)
      .maybeSingle(),
  ]);
  if (roster.error) throw new Error(`exam_students: ${roster.error.message}`);
  if (sessions.error) throw new Error(`sessions: ${sessions.error.message}`);
  if (assignment.error) throw new Error(`proctor_assignments: ${assignment.error.message}`);

  return {
    exam: exam.data,
    roster: parseRows(RosterEntry, roster.data ?? []),
    sessions: parseRows(LobbySession, sessions.data ?? []),
    who: { role: staff.role, isLead: assignment.data?.is_lead === true },
  };
}
