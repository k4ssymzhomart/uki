import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXAM_ID, pgTime, SESSION_ID, STAFF_ID, T0 } from "../test/fixtures.ts";
import { uuidv7 } from "./ids.ts";
import {
  AddSessionNoteInput,
  CloseHelpRequestInput,
  CloseHelpRequestOutput,
  DecideSessionInput,
  DecideSessionOutput,
  formatVerifyCode,
  HelpRequest,
  isInReviewQueue,
  normalizeVerifyCode,
  REVIEW_DECISIONS,
  ReportPayload,
  SharedReportPayload,
  ShareLink,
  sortHelpRequests,
  VerifyReportOutput,
  verifyCodeFromDigest,
  verifyCodeInput,
} from "./review.ts";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("help requests (2.4d)", () => {
  const help = {
    id: uuidv7(),
    session_id: SESSION_ID,
    exam_id: EXAM_ID,
    student_id: uuidv7(),
    student_name: "Saule Temirbekova",
    topic: "technical",
    text: "My camera froze for a second. Is my exam still running?",
    created_at: pgTime(T0),
    reply: null,
    done_at: null,
    done_by: null,
  } as const;

  it("reads a request and its closing", () => {
    expect(HelpRequest.parse(help)).toEqual(help);
    expect(
      CloseHelpRequestOutput.parse({
        ...help,
        done_at: pgTime(T0 + 1000),
        done_by: STAFF_ID,
        message_sent: false,
      }),
    ).toMatchObject({ message_sent: false });
  });

  it("takes a reply of at most 280 characters, as a message command", () => {
    expect(CloseHelpRequestInput.safeParse({ id: help.id }).success).toBe(true);
    expect(CloseHelpRequestInput.safeParse({ id: help.id, reply: "Yes, it is." }).success).toBe(true);
    expect(CloseHelpRequestInput.safeParse({ id: help.id, reply: "x".repeat(281) }).success).toBe(false);
  });

  it("lists open requests first, oldest first", () => {
    const a = { created_at: pgTime(T0 + 2000), done_at: null };
    const b = { created_at: pgTime(T0), done_at: pgTime(T0 + 5000) };
    const c = { created_at: pgTime(T0 + 1000), done_at: null };
    expect(sortHelpRequests([a, b, c])).toEqual([c, a, b]);
  });
});

describe("decisions, notes and the queue (3.2, 3.3)", () => {
  it("has the three decisions of 3.3", () => {
    expect(REVIEW_DECISIONS).toEqual(["no_issue", "talk", "committee"]);
    expect(
      DecideSessionInput.safeParse({ session_id: SESSION_ID, decision: "talk", note: "Phone face down." })
        .success,
    ).toBe(true);
    expect(DecideSessionInput.safeParse({ session_id: SESSION_ID, decision: "fail" }).success).toBe(false);
    expect(
      DecideSessionInput.safeParse({ session_id: SESSION_ID, decision: "talk", note: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });

  it("reads decide_session's reply with the exam status", () => {
    const reply = {
      session_id: SESSION_ID,
      decision: "no_issue",
      note: null,
      reviewer_id: STAFF_ID,
      decided_at: pgTime(T0),
      exam_status: "reviewed",
    };
    expect(DecideSessionOutput.parse(reply)).toEqual(reply);
  });

  it("keeps a session in the queue until its decision is newer than every flag", () => {
    expect(isInReviewQueue([], null)).toBe(false);
    expect(isInReviewQueue([pgTime(T0)], null)).toBe(true);
    expect(isInReviewQueue([pgTime(T0)], pgTime(T0 + 1000))).toBe(false);
    expect(isInReviewQueue([pgTime(T0), pgTime(T0 + 2000)], pgTime(T0 + 1000))).toBe(true);
  });

  it("takes a note of 1 to 500 characters", () => {
    expect(AddSessionNoteInput.safeParse({ session_id: SESSION_ID, text: " " }).success).toBe(false);
    expect(AddSessionNoteInput.safeParse({ session_id: SESSION_ID, text: "x".repeat(500) }).success).toBe(
      true,
    );
  });
});

describe("verify codes (3.4, 3.5, /verify)", () => {
  // The same report id and hash give XHHVQ7Z2YZ3D in supabase/tests/12_reports.test.sql.
  const REPORT_ID = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405162";

  it("cuts 12 Crockford characters from SHA-256 of '<report id>:<content hash>', as the database does", () => {
    const digest = sha256(verifyCodeInput(REPORT_ID, "abc"));
    expect(digest.slice(0, 15)).toBe("ec63bb9fe2f7c6d");
    expect(verifyCodeFromDigest(digest)).toBe("XHHVQ7Z2YZ3D");
    expect(verifyCodeInput(REPORT_ID.toUpperCase(), "abc")).toBe(`${REPORT_ID}:abc`);
  });

  it("gives a new code when the content changes", () => {
    const first = verifyCodeFromDigest(sha256(verifyCodeInput(REPORT_ID, "a".repeat(64))));
    const second = verifyCodeFromDigest(sha256(verifyCodeInput(REPORT_ID, "b".repeat(64))));
    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(second).not.toBe(first);
    expect(() => verifyCodeFromDigest("xyz")).toThrow(RangeError);
  });

  it("prints UKI-RPT-XXXX-XXXX-XXXX and reads it back however it is typed", () => {
    expect(formatVerifyCode("7K2M9QXD4HPA")).toBe("UKI-RPT-7K2M-9QXD-4HPA");
    expect(normalizeVerifyCode("UKI-RPT-7K2M-9QXD-4HPA")).toBe("7K2M9QXD4HPA");
    expect(normalizeVerifyCode(" uki rpt 7k2m 9qxd 4hpa ")).toBe("7K2M9QXD4HPA");
    expect(normalizeVerifyCode("7K2M9QXD4HPA")).toBe("7K2M9QXD4HPA");
    expect(normalizeVerifyCode("7K2M9QXD4HPO")).toBe("7K2M9QXD4HP0");
    expect(normalizeVerifyCode("UKI-RPT-0917-MT")).toBeNull();
    expect(normalizeVerifyCode("7K2M9QXD4HPU")).toBeNull();
  });
});

describe("report, share link and verification", () => {
  const report = {
    report: { id: uuidv7(), verify_code: "7K2M9QXD4HPA", created_at: pgTime(T0), issued_at: pgTime(T0) },
    session: {
      id: SESSION_ID,
      state: "submitted",
      locale: "kk",
      joined_at: pgTime(T0 - 600_000),
      started_at: pgTime(T0),
      submitted_at: pgTime(T0 + 5_220_000),
      ended_at: null,
      end_reason: null,
      time_used_s: 5220,
      extra_min: 0,
      receipt_id: "UKI-204-0917-MT",
      identity_result: "matched",
      identity_score: 0.93,
      identity_at: pgTime(T0 - 300_000),
      rules_accepted_at: pgTime(T0 - 120_000),
      rules_locale: "kk",
      device: { os: "macos", app_version: "0.1.0" },
    },
    student: {
      id: uuidv7(),
      full_name: "Madina Tulegenova",
      student_number: "20231187",
      group_code: "204",
      programme: "Mathematics",
      year: 2,
    },
    exam: {
      id: EXAM_ID,
      title: "Mathematics 2 · Midterm",
      course: "Mathematics 2",
      kind: "Midterm",
      code: "MATH2-204-FRI",
      mode: "app",
      starts_at: pgTime(T0),
      duration_min: 90,
      faculty_name: "Faculty of Mathematics",
      workspace_name: "KRU · Kostanay",
      timezone: "Asia/Almaty",
    },
    proctor_name: "Aigerim Sadykova",
    flags: [
      {
        id: uuidv7(),
        type: "phone.detected",
        source: "app",
        at: pgTime(T0 + 430_000),
        received_at: pgTime(T0 + 430_200),
        data: { score: 0.94, held_ms: 6000 },
        frame_count: 3,
        frames: [{ id: uuidv7(), captured_at: pgTime(T0 + 430_000) }],
      },
    ],
    notes: [
      {
        id: uuidv7(),
        at: pgTime(T0 + 500_000),
        text: "Phone face down.",
        staff_id: STAFF_ID,
        by_name: "Aigerim Sadykova",
      },
    ],
    decision: {
      decision: "talk",
      note: "Phone face down after the warning.",
      reviewer_id: STAFF_ID,
      reviewer_name: "Aigerim Sadykova",
      decided_at: pgTime(T0 + 7_000_000),
    },
    data_kept: {
      video_bytes: 0,
      session_frames: 3,
      session_events: 412,
      exam_frames: 61,
      exam_events: 12_418,
      retention_days: 90,
      frames_kept_until: pgTime(T0 + 90 * 86_400_000),
    },
    generated_at: pgTime(T0 + 8_000_000),
  };

  it("reads 3.4's payload and refuses any video", () => {
    expect(ReportPayload.parse(report)).toEqual(report);
    expect(
      ReportPayload.safeParse({ ...report, data_kept: { ...report.data_kept, video_bytes: 1 } }).success,
    ).toBe(false);
    expect(ReportPayload.safeParse({ ...report, report: null, decision: null }).success).toBe(true);
  });

  it("reads 3.5's payload with who shared it", () => {
    const shared = {
      ...report,
      share: {
        id: uuidv7(),
        expires_at: pgTime(T0),
        shared_by: "Dana Akhmetova",
        workspace_name: "KRU · Kostanay",
      },
    };
    expect(SharedReportPayload.parse(shared).share.shared_by).toBe("Dana Akhmetova");
  });

  it("returns the token once, as a 43-character base64url string in /r/", () => {
    const token = `${"a".repeat(40)}_-Z`;
    expect(
      ShareLink.safeParse({ share_id: uuidv7(), token, path: `/r/${token}`, expires_at: pgTime(T0) }).success,
    ).toBe(true);
    expect(
      ShareLink.safeParse({ share_id: uuidv7(), token: "short", path: "/r/short", expires_at: pgTime(T0) })
        .success,
    ).toBe(false);
  });

  it("verifies found and intact, found and changed, or not found", () => {
    expect(VerifyReportOutput.parse({ found: false })).toEqual({ found: false });
    const found = {
      found: true,
      code: "7K2M9QXD4HPA",
      exam_title: "Mathematics 2 · Midterm",
      exam_starts_at: pgTime(T0),
      timezone: "Asia/Almaty",
      initials: "MT",
      issued_at: pgTime(T0),
      intact: false,
    };
    expect(VerifyReportOutput.parse(found)).toEqual(found);
    expect(VerifyReportOutput.safeParse({ ...found, initials: "MTX" }).success).toBe(false);
  });
});
