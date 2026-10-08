// Madina's report as 3.4 and 3.5 draw it (Figma 51:2096, 162:13464), for the unit and render tests.
import type { ReportPayload, SharedReportResponse } from "@uki/contracts";

export const AIGERIM_ID = "b0000000-0000-4000-8000-000000000002";
const PHONE = "01900000-0000-7000-8000-00000000a001";
const AWAY = "01900000-0000-7000-8000-00000000a002";
const DOWN = "01900000-0000-7000-8000-00000000a003";

export function reportFixture(): ReportPayload {
  return {
    report: {
      id: "f0000000-0000-4000-8000-000000000917",
      verify_code: "7K2M9QXD",
      created_at: "2026-10-09T06:52:00.000Z",
      issued_at: "2026-10-09T06:52:00.000Z",
    },
    session: {
      id: "d0000000-0000-4000-8001-000000000007",
      state: "submitted",
      locale: "kk",
      joined_at: "2026-10-09T04:38:00.000Z",
      started_at: "2026-10-09T05:00:00.000Z",
      submitted_at: "2026-10-09T06:27:00.000Z",
      ended_at: "2026-10-09T06:27:00.000Z",
      end_reason: null,
      time_used_s: 87 * 60 + 10,
      extra_min: 0,
      receipt_id: "R-0917",
      identity_result: "matched",
      identity_score: 0.91,
      identity_at: "2026-10-09T04:40:55.000Z",
      rules_accepted_at: "2026-10-09T04:41:30.000Z",
      rules_locale: "kk",
      device: { os: "windows" },
    },
    student: {
      id: "c0000000-0000-4000-8000-000000000007",
      full_name: "Madina Tulegenova",
      student_number: "20231187",
      group_code: "204",
      programme: "Mathematics",
      year: 2,
    },
    exam: {
      id: "e0000000-0000-4000-8000-000000000001",
      title: "Mathematics 2 · Midterm",
      course: "Mathematics 2",
      kind: "Midterm",
      code: "MATH2-204-FRI",
      mode: "app",
      starts_at: "2026-10-09T05:00:00.000Z",
      duration_min: 90,
      faculty_name: "Faculty of Mathematics",
      workspace_name: "KRU · Kostanay",
      timezone: "Asia/Almaty",
    },
    proctor_name: "Aigerim Sadykova",
    flags: [
      {
        id: PHONE,
        type: "phone.detected",
        source: "app",
        at: "2026-10-09T05:47:10.000Z",
        received_at: "2026-10-09T05:47:10.300Z",
        data: { score: 0.94, held_ms: 6000 },
        frame_count: 1,
        frames: [{ id: "f1000000-0000-4000-8000-000000000001", captured_at: "2026-10-09T05:47:10.000Z" }],
      },
      {
        id: AWAY,
        type: "gaze.off_screen",
        source: "app",
        at: "2026-10-09T05:43:02.000Z",
        received_at: "2026-10-09T05:43:02.300Z",
        data: { duration_ms: 2300, direction: "left" },
        frame_count: 1,
        frames: [{ id: "f1000000-0000-4000-8000-000000000002", captured_at: "2026-10-09T05:43:02.000Z" }],
      },
      {
        id: DOWN,
        type: "gaze.down",
        source: "app",
        at: "2026-10-09T05:58:40.000Z",
        received_at: "2026-10-09T05:58:40.300Z",
        data: { duration_ms: 3100 },
        frame_count: 1,
        frames: [{ id: "f1000000-0000-4000-8000-000000000003", captured_at: "2026-10-09T05:58:40.000Z" }],
      },
    ],
    notes: [],
    decision: {
      decision: "talk",
      note: "Phone face down after the warning.",
      reviewer_id: AIGERIM_ID,
      reviewer_name: "Aigerim Sadykova",
      decided_at: "2026-10-09T06:52:00.000Z",
    },
    data_kept: {
      video_bytes: 0,
      session_frames: 3,
      session_events: 412,
      exam_frames: 61,
      exam_events: 12418,
      retention_days: 90,
      frames_kept_until: "2027-01-07T05:47:10.000Z",
    },
    generated_at: "2026-10-09T06:52:00.000Z",
  };
}

export function sharedFixture(): SharedReportResponse {
  const report = reportFixture();
  return {
    ...report,
    share: {
      id: "f2000000-0000-4000-8000-000000000001",
      expires_at: "2026-10-16T06:52:00.000Z",
      shared_by: "Dana Akhmetova",
      workspace_name: "KRU · Kostanay",
    },
    stills: report.flags.map((flag, index) => ({
      frame_id: flag.frames[0]?.id ?? "",
      event_id: flag.id,
      url: `https://stills.test/${index}.jpg`,
      captured_at: flag.at,
    })),
  };
}
