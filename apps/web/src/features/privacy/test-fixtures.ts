// Rows for the A.5, A.5a, A.5b and A.6 component tests and their Russian render test, shaped as the views
// get them from the server: the frames' two requests (Yerlan's delete, Zhansaya's copy), the frames'
// recent access and audit entries, and the counts A.5a and A.5b list.
import { DEFAULT_WORKSPACE_SETTINGS } from "@uki/contracts";
import type { PrivacyCentreData, RequestDetail } from "./privacy-data.ts";
import {
  type AuditEntry,
  type AuditNames,
  type AuditRow,
  auditEntries,
  type RequestRow,
} from "./privacy-model.ts";

export const WORKSPACE = "a0000000-0000-4000-8000-000000000001";
export const DANA_ID = "c0000000-0000-4000-8000-000000000001";
export const AIGERIM_ID = "c0000000-0000-4000-8000-000000000002";
export const YERLAN_ID = "b0000000-0000-4000-8000-000020230877";
export const ZHANSAYA_ID = "b0000000-0000-4000-8000-000020231302";
export const MADINA_ID = "b0000000-0000-4000-8000-000020231187";
export const DELETE_REQUEST = "d0000000-0000-4000-8000-000000000001";
export const COPY_REQUEST = "d0000000-0000-4000-8000-000000000002";
const SESSION = "5e000000-0000-4000-8000-000000000001";
const EXAM = "e0000000-0000-4000-8000-000000000001";
const REPORT = "f0000000-0000-4000-8000-000000000001";

/** 12 Oct 2026, 10:00 in Almaty: the day the frames' requests are open. */
export const NOW_MS = Date.parse("2026-10-12T05:00:00Z");

export const YERLAN_DELETE: RequestRow = {
  id: DELETE_REQUEST,
  student_id: YERLAN_ID,
  kind: "delete",
  status: "received",
  received_at: "2026-10-07T06:00:00Z",
  due_at: "2026-10-14T06:00:00Z",
  reply: null,
  export_path: null,
  done_by: null,
  done_at: null,
  students: { full_name: "Yerlan Tokhtarov", student_number: "20230877" },
};

export const ZHANSAYA_COPY: RequestRow = {
  id: COPY_REQUEST,
  student_id: ZHANSAYA_ID,
  kind: "copy",
  status: "received",
  received_at: "2026-10-09T06:00:00Z",
  due_at: "2026-10-16T06:00:00Z",
  reply: null,
  export_path: null,
  done_by: null,
  done_at: null,
  students: { full_name: "Zhansaya Omarova", student_number: "20231302" },
};

function audit(id: number, at: string, patch: Partial<AuditRow>): AuditRow {
  return {
    id,
    at,
    actor_id: AIGERIM_ID,
    actor_kind: "staff",
    action: "still.viewed",
    object_type: "frame",
    object_id: null,
    meta: {},
    ...patch,
  };
}

/** A.6's rows, newest first as the frame lists them (times in UTC; Almaty is UTC+5). */
export const AUDIT_ROWS: AuditRow[] = [
  audit(9, "2026-10-09T22:00:00Z", {
    actor_id: null,
    actor_kind: "service",
    action: "retention.run",
    object_type: "workspace",
    object_id: WORKSPACE,
    meta: { frames: 1204, retention_days: 90 },
  }),
  audit(8, "2026-10-09T10:10:00Z", {
    actor_id: DANA_ID,
    action: "settings.update",
    object_type: "workspace",
    object_id: WORKSPACE,
    meta: { before: { retention_days: 120 }, after: { retention_days: 90 } },
  }),
  audit(7, "2026-10-09T07:05:00Z", {
    actor_id: null,
    actor_kind: "share",
    action: "report.share_view",
    object_type: "report",
    object_id: REPORT,
  }),
  audit(6, "2026-10-09T06:52:00Z", {
    action: "review.decide",
    object_type: "session",
    object_id: SESSION,
    meta: { decision: "talk" },
  }),
  // Three stills opened at once: one entry, "Viewed 3 flagged frames".
  ...[5, 4, 3].map((id) =>
    audit(id, "2026-10-09T06:41:00Z", {
      object_id: `fa000000-0000-4000-8000-00000000000${id}`,
      meta: { session_id: SESSION },
    }),
  ),
  audit(2, "2026-10-09T05:00:00Z", {
    action: "start_exam",
    object_type: "exam",
    object_id: EXAM,
  }),
  audit(1, "2026-10-08T07:40:00Z", {
    actor_id: DANA_ID,
    action: "data_request.delete",
    object_type: "student",
    object_id: MADINA_ID,
    meta: { stills: 4, frames: 4, events: 1206 },
  }),
];

export const AUDIT_NAMES: AuditNames = {
  staff: { [DANA_ID]: "Dana Akhmetova", [AIGERIM_ID]: "Aigerim Sadykova" },
  studentUsers: {},
  students: { [MADINA_ID]: "Madina Tulegenova" },
  sessions: { [SESSION]: { student: "Madina Tulegenova", exam: "Mathematics 2" } },
  exams: { [EXAM]: { title: "Mathematics 2", kind: "Midterm" } },
  reports: { [REPORT]: "0917MT3P8X1Z" },
};

export const AUDIT_ENTRIES: AuditEntry[] = auditEntries(AUDIT_ROWS, AUDIT_NAMES);

export const CENTRE: PrivacyCentreData = {
  workspaceId: WORKSPACE,
  settings: DEFAULT_WORKSPACE_SETTINGS,
  sessionsThisTerm: 4912,
  cleanup: { at: "2026-10-12T22:00:00Z", frames: 1204 },
  requests: [ZHANSAYA_COPY, YERLAN_DELETE],
  recent: AUDIT_ENTRIES.filter((entry) => entry.actor.kind === "staff").slice(0, 3),
};

const COUNTS = {
  exams: 2,
  frames: 4,
  frameExams: 2,
  events: 1206,
  eventExams: 2,
  flags: 3,
  identityScores: 2,
  devices: 2,
  laptops: 1,
  appVersion: "1.4.2",
  consents: 2,
  receipts: 2,
  reports: ["0922YT7K4M2Q"],
};

/** A.5a: Yerlan's delete request, open. */
export const YERLAN_DETAIL: RequestDetail = {
  target: { type: "request", requestId: DELETE_REQUEST },
  kind: "delete",
  request: YERLAN_DELETE,
  student: { id: YERLAN_ID, full_name: "Yerlan Tokhtarov", student_number: "20230877" },
  receivedAt: YERLAN_DELETE.received_at,
  dueAt: YERLAN_DELETE.due_at,
  doneBy: null,
  counts: COUNTS,
};

/** A.5b: Zhansaya's copy request, open. */
export const ZHANSAYA_DETAIL: RequestDetail = {
  target: { type: "request", requestId: COPY_REQUEST },
  kind: "copy",
  request: ZHANSAYA_COPY,
  student: { id: ZHANSAYA_ID, full_name: "Zhansaya Omarova", student_number: "20231302" },
  receivedAt: ZHANSAYA_COPY.received_at,
  dueAt: ZHANSAYA_COPY.due_at,
  doneBy: null,
  counts: { ...COUNTS, exams: 4, flags: 1, frames: 1, consents: 4, reports: [] },
};
