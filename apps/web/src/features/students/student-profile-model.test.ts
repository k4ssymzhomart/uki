import { describe, expect, it } from "vitest";
import {
  dataKept,
  examHistory,
  latestConsent,
  type ProfileDecision,
  type ProfileFlag,
  type ProfileSession,
  ProfileSession as ProfileSessionSchema,
  parseRows,
  profileDevices,
  profileStats,
} from "./student-profile-model.ts";

const sessionId = (n: number) => `5e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const examId = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function session(
  n: number,
  patch: Partial<ProfileSession> = {},
  exam: Partial<ProfileSession["exams"]> = {},
) {
  return {
    id: sessionId(n),
    exam_id: examId(n),
    state: "submitted",
    joined_at: "2026-10-09T04:40:00+00:00",
    last_seen_at: "2026-10-09T06:27:00+00:00",
    time_used_s: 87 * 60,
    device: { os: "macos", app_version: "0.1.0" },
    rules_accepted_at: null,
    rules_locale: null,
    exams: {
      title: "Mathematics 2 · Midterm",
      course: "Mathematics 2",
      starts_at: "2026-10-09T05:00:00+00:00",
      duration_min: 90,
      ...exam,
    },
    ...patch,
  } satisfies ProfileSession;
}

const flag = (n: number, at: string): ProfileFlag => ({ session_id: sessionId(n), received_at: at });
const decision = (n: number, value: ProfileDecision["decision"], at: string): ProfileDecision => ({
  session_id: sessionId(n),
  decision: value,
  decided_at: at,
});

describe("A.3 exam history and tiles", () => {
  const sessions = [
    session(1),
    session(
      2,
      { time_used_s: 48 * 60 },
      {
        title: "English B2 · Reading",
        course: "English B2",
        starts_at: "2026-10-03T10:00:00+00:00",
        duration_min: 50,
      },
    ),
    session(
      3,
      { time_used_s: 0, state: "writing" },
      { title: "Linear Algebra · Quiz 1", course: "Linear Algebra", starts_at: "2026-09-24T04:00:00+00:00" },
    ),
    session(
      4,
      { time_used_s: 38 * 60 },
      { title: "Mathematics 2 · Quiz 1", starts_at: "2026-09-18T04:00:00+00:00", duration_min: 40 },
    ),
  ];
  const flags = [
    flag(1, "2026-10-09T05:20:00+00:00"),
    flag(1, "2026-10-09T05:30:00+00:00"),
    flag(1, "2026-10-09T05:40:00+00:00"),
    flag(3, "2026-09-24T04:10:00+00:00"),
    flag(4, "2026-09-18T04:10:00+00:00"),
  ];
  const decisions = [
    decision(1, "talk", "2026-10-09T08:00:00+00:00"),
    decision(4, "no_issue", "2026-09-18T06:00:00+00:00"),
    // A decision of another student's session is not counted.
    decision(99, "committee", "2026-10-09T09:00:00+00:00"),
  ];

  it("lists one row per session, newest exam first, with time, flags and status", () => {
    const history = examHistory(sessions, flags, decisions);
    expect(history.map((row) => [row.title, row.usedMin, row.durationMin, row.flags, row.status])).toEqual([
      ["Mathematics 2 · Midterm", 87, 90, 3, "followUp"],
      ["English B2 · Reading", 48, 50, 0, "clear"],
      ["Linear Algebra · Quiz 1", null, 90, 1, "inReview"],
      ["Mathematics 2 · Quiz 1", 38, 40, 1, "noIssue"],
    ]);
  });

  it("puts a session back in review when a flag arrives after its decision", () => {
    const later = [...flags, flag(4, "2026-09-18T07:00:00+00:00")];
    expect(
      examHistory(sessions, later, decisions).find((row) => row.sessionId === sessionId(4))?.status,
    ).toBe("inReview");
  });

  it("counts exams since the first, flags with the course that has most, and decisions", () => {
    const stats = profileStats(examHistory(sessions, flags, decisions), decisions);
    expect(stats).toEqual({
      exams: 4,
      firstExamAt: "2026-09-18T04:00:00+00:00",
      flags: 5,
      topCourse: { course: "Mathematics 2", flags: 4 },
      decisions: 2,
      committee: 0,
      latest: "talk",
    });
    expect(profileStats([], [])).toEqual({
      exams: 0,
      firstExamAt: null,
      flags: 0,
      topCourse: null,
      decisions: 0,
      committee: 0,
      latest: null,
    });
  });
});

describe("A.3 devices, consent and data kept", () => {
  it("lists each app and Lock the sessions reported, with when it was last seen", () => {
    const devices = profileDevices([
      session(1, { last_seen_at: "2026-10-09T06:27:00+00:00" }),
      session(2, { last_seen_at: "2026-10-03T10:50:00+00:00" }),
      session(3, {
        last_seen_at: null,
        joined_at: "2026-09-24T03:50:00+00:00",
        device: { os: "windows", app_version: "0.1.0", browser: "Chrome", lock_version: "0.1.0" },
      }),
      session(4, { device: {} }),
    ]);
    expect(devices).toEqual([
      { kind: "app", os: "macos", version: "0.1.0", seenAt: "2026-10-09T06:27:00+00:00" },
      { kind: "app", os: "windows", version: "0.1.0", seenAt: "2026-09-24T03:50:00+00:00" },
      { kind: "lock", browser: "Chrome", version: "0.1.0", seenAt: "2026-09-24T03:50:00+00:00" },
    ]);
  });

  it("shows when and in which language the rules were last accepted", () => {
    expect(latestConsent([session(1), session(2)])).toBeNull();
    expect(
      latestConsent([
        session(1, { rules_accepted_at: "2026-10-09T04:58:00+00:00", rules_locale: "kk" }),
        session(2, { rules_accepted_at: "2026-10-03T09:55:00+00:00", rules_locale: "ru" }),
      ]),
    ).toEqual({
      acceptedAt: "2026-10-09T04:58:00+00:00",
      locale: "kk",
      examTitle: "Mathematics 2 · Midterm",
    });
  });

  it("counts kept stills and dates the last one's deletion by the retention days", () => {
    const kept = dataKept(
      [
        { session_id: sessionId(1), captured_at: "2026-10-09T05:20:00+00:00" },
        { session_id: sessionId(1), captured_at: "2026-09-24T04:10:00+00:00" },
      ],
      [session(1), session(2), session(5, { exam_id: examId(1) })],
      90,
    );
    // 9 Oct 2026 plus 90 days is 7 Jan 2027, as A.3 reads.
    expect(kept).toEqual({ frames: 2, framesGoneAt: Date.parse("2027-01-07T05:20:00Z"), exams: 2 });
    expect(dataKept([], [], 90)).toEqual({ frames: 0, framesGoneAt: null, exams: 0 });
  });

  it("parses PostgREST rows and leaves out one without its exam", () => {
    const { exams: _exams, ...noExam } = session(2);
    expect(parseRows(ProfileSessionSchema, [session(1), noExam]).map((row) => row.id)).toEqual([
      sessionId(1),
    ]);
  });
});
