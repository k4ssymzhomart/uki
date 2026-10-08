import { describe, expect, it } from "vitest";
import { EXAM_ID, pgTime, SESSION_ID, STAFF_ID, T0 } from "../test/fixtures.ts";
import { uuidv7 } from "./ids.ts";
import {
  ActiveShare,
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
  RevokeShareInput,
  RevokeShareOutput,
  SHARE_TTL_DAYS,
  SharedReportPayload,
  ShareLink,
  sortHelpRequests,
  VERIFY_CODE_ALPHABET,
  VERIFY_CODE_LENGTH,
  VERIFY_LOOKUPS_PER_MINUTE,
  VerifyCode,
  VerifyReportInput,
  VerifyReportOutput,
} from "./review.ts";

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
  it("uses Crockford base32: 32 characters, digits and capitals without I, L, O or U", () => {
    expect(VERIFY_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(VERIFY_CODE_ALPHABET).size).toBe(32);
    expect(VERIFY_CODE_ALPHABET).toMatch(/^[0-9A-Z]+$/);
    for (const letter of ["I", "L", "O", "U"]) expect(VERIFY_CODE_ALPHABET).not.toContain(letter);
    expect([...VERIFY_CODE_ALPHABET].sort().join("")).toBe(VERIFY_CODE_ALPHABET);
  });

  it("is 8 characters of that alphabet", () => {
    expect(VERIFY_CODE_LENGTH).toBe(8);
    expect(VerifyCode.safeParse("7K2M9QXD").success).toBe(true);
    expect(VerifyCode.safeParse(VERIFY_CODE_ALPHABET.slice(24)).success).toBe(true);
    for (const bad of ["7K2M9QX", "7K2M9QXD4", "7k2m9qxd", "7K2M9QXU", "7K2M9QXI", "7K2M9QXL", "7K2M9QXO"]) {
      expect(VerifyCode.safeParse(bad).success).toBe(false);
    }
  });

  it("prints UKI-XXXX-XXXX", () => {
    expect(formatVerifyCode("7K2M9QXD")).toBe("UKI-7K2M-9QXD");
  });

  it("reads a code back however it is typed: case, prefix, spaces and hyphens do not matter", () => {
    expect(normalizeVerifyCode("UKI-7K2M-9QXD")).toBe("7K2M9QXD");
    expect(normalizeVerifyCode("uki-7k2m-9qxd")).toBe("7K2M9QXD");
    expect(normalizeVerifyCode(" uki 7k2m 9qxd ")).toBe("7K2M9QXD");
    expect(normalizeVerifyCode("7K2M9QXD")).toBe("7K2M9QXD");
    expect(normalizeVerifyCode("7k2m-9qxd")).toBe("7K2M9QXD");
    expect(normalizeVerifyCode(formatVerifyCode("0123ABCD"))).toBe("0123ABCD");
  });

  it("reads O as 0 and I or L as 1, and never reads U", () => {
    expect(normalizeVerifyCode("UKI-O1IL-9QXD")).toBe("01119QXD");
    expect(normalizeVerifyCode("uki-oiil-9qxd")).toBe("01119QXD");
    expect(normalizeVerifyCode("7K2M9QXU")).toBeNull();
  });

  it("refuses anything else: the old forms, the wrong length, other characters", () => {
    expect(normalizeVerifyCode("UKI-RPT-7K2M-9QXD-4HPA")).toBeNull();
    expect(normalizeVerifyCode("7K2M9QXD4HPA")).toBeNull();
    expect(normalizeVerifyCode("UKI-RPT-0917-MT")).toBeNull();
    expect(normalizeVerifyCode("UKI-7K2M-9QX")).toBeNull();
    expect(normalizeVerifyCode("XYZ-7K2M-9QXD")).toBeNull();
    expect(normalizeVerifyCode("")).toBeNull();
    expect(normalizeVerifyCode(`UKI-7K2M-9QXD${" ".repeat(64)}`)).toBe("7K2M9QXD");
    expect(normalizeVerifyCode(`${" ".repeat(64)}UKI-7K2M-9QXD`)).toBeNull();
  });
});

describe("report, share link and verification", () => {
  const report = {
    report: { id: uuidv7(), verify_code: "7K2M9QXD", created_at: pgTime(T0), issued_at: pgTime(T0) },
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
      code: "7K2M9QXD",
      exam_title: "Mathematics 2 · Midterm",
      exam_starts_at: pgTime(T0),
      timezone: "Asia/Almaty",
      initials: "MT",
      issued_at: pgTime(T0),
      intact: false,
    };
    expect(VerifyReportOutput.parse(found)).toEqual(found);
    expect(VerifyReportOutput.safeParse({ ...found, initials: "MTX" }).success).toBe(false);
    expect(VerifyReportOutput.safeParse({ ...found, code: "7K2M9QXD4HPA" }).success).toBe(false);
  });

  it("asks verify_report with the code and the SHA-256 of the client's IP", () => {
    const client_hash = "a".repeat(64);
    expect(VerifyReportInput.safeParse({ code: "uki-7k2m-9qxd", client_hash }).success).toBe(true);
    expect(VerifyReportInput.safeParse({ code: "uki-7k2m-9qxd", client_hash: "A".repeat(64) }).success).toBe(
      false,
    );
    expect(VerifyReportInput.safeParse({ code: "uki-7k2m-9qxd", client_hash: "127.0.0.1" }).success).toBe(
      false,
    );
    expect(VerifyReportInput.safeParse({ code: "", client_hash }).success).toBe(false);
    expect(VERIFY_LOOKUPS_PER_MINUTE).toBe(10);
  });

  it("makes links that last 30 days, and revokes one by its id", () => {
    expect(SHARE_TTL_DAYS).toBe(30);
    const shareId = uuidv7();
    expect(RevokeShareInput.parse({ share_id: shareId })).toEqual({ share_id: shareId });
    expect(RevokeShareInput.safeParse({ share_id: "share" }).success).toBe(false);
    const revoked = { share_id: shareId, report_id: uuidv7(), revoked_at: pgTime(T0) };
    expect(RevokeShareOutput.parse(revoked)).toEqual(revoked);
    expect(RevokeShareOutput.safeParse({ ...revoked, revoked_at: null }).success).toBe(false);
    const active = { id: shareId, created_at: pgTime(T0), expires_at: pgTime(T0) };
    expect(ActiveShare.parse(active)).toEqual(active);
    expect(ActiveShare.safeParse({ ...active, id: "share" }).success).toBe(false);
  });
});
