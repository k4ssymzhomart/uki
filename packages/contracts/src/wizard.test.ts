import { describe, expect, it } from "vitest";
import { BrowserRules, DEFAULT_BROWSER_RULES, effectiveBrowserRules } from "./browser-rules.ts";
import { DEFAULT_EXAM_CHECKS } from "./checks.ts";
import { uuidv7 } from "./ids.ts";
import {
  AssignProctorsInput,
  ConfirmSeatsInput,
  checkRoster,
  checkSeatRanges,
  DEFAULT_WORKSPACE_SETTINGS,
  ExamDraft,
  ExamDraftInput,
  FixInviteEmailInput,
  ImportRosterInput,
  InviteStatus,
  ProctorAssignment,
  parseScheduleError,
  ResendInviteInput,
  RosterRow,
  rosterLocale,
  SCHEDULE_PROBLEMS,
  ScheduleExamOutput,
  WorkspaceSettings,
} from "./wizard.ts";

const GROUPS = ["204", "101", "102"];

describe("RosterRow and checkRoster (0.3, 0.3a)", () => {
  const good = {
    student_number: "20231187",
    full_name: "Madina Tulegenova",
    email: "Madina@Student.KRU.test ",
    group: "204",
    locale: "kk",
  };

  it("normalises a valid row", () => {
    expect(RosterRow.parse(good)).toEqual({ ...good, email: "madina@student.kru.test" });
    expect(RosterRow.parse({ ...good, locale: " Рус " }).locale).toBe("ru");
    expect(RosterRow.parse({ ...good, locale: "ENG" }).locale).toBe("en");
  });

  it("refuses a 7-digit number, a broken address and an unknown language", () => {
    expect(RosterRow.safeParse({ ...good, student_number: "2023118" }).success).toBe(false);
    expect(RosterRow.safeParse({ ...good, email: "madina.student.kru.test" }).success).toBe(false);
    expect(RosterRow.safeParse({ ...good, locale: "de" }).success).toBe(false);
    expect(RosterRow.safeParse({ ...good, extra: 1 }).success).toBe(false);
  });

  it("lists every bad row with what to fix, like 0.3a", () => {
    const rows = [
      good,
      { ...good, student_number: "20231219", full_name: "Aruzhan Kassymova", email: "aruzhan.kru.test" },
      { ...good, student_number: "20231377", full_name: "Timur Nurlanov" },
      { ...good, student_number: "20231377", full_name: "Timur Nurlanov" },
      { ...good, student_number: "20235088", full_name: "Dana Zhakupova", group: " " },
      { ...good, student_number: "20235121", full_name: "" },
      { ...good, student_number: "2023512", email: "x@y.z", group: "999", locale: "de" },
    ];
    const result = checkRoster(rows, GROUPS);
    expect(result.validRows).toEqual([1, 3]);
    expect(result.valid.map((row) => row.student_number)).toEqual(["20231187", "20231377"]);
    expect(result.issues.map(({ row, column, problem }) => [row, column, problem])).toEqual([
      [2, "email", "email_no_at"],
      [4, "student_number", "number_duplicate"],
      [5, "group", "group_empty"],
      [6, "full_name", "name_empty"],
      [7, "student_number", "number_invalid"],
      [7, "email", "email_invalid"],
      [7, "group", "group_unknown"],
      [7, "locale", "locale_invalid"],
    ]);
    expect(result.issues[1]?.value).toBe("20231377");
  });

  it("compares group codes without case and takes numbers as numbers", () => {
    const result = checkRoster([{ ...good, group: "ab-1", student_number: 20231187 }], ["AB-1"]);
    expect(result.issues).toEqual([]);
    expect(result.valid[0]?.student_number).toBe("20231187");
  });

  it("maps the usual language spellings", () => {
    expect(rosterLocale("Қазақша")).toBe("kk");
    expect(rosterLocale("KZ")).toBe("kk");
    expect(rosterLocale("русский")).toBe("ru");
    expect(rosterLocale("English")).toBe("en");
    expect(rosterLocale("fr")).toBeNull();
    expect(rosterLocale(3)).toBeNull();
  });

  it("sends only checked rows to import_roster", () => {
    expect(ImportRosterInput.safeParse({ exam_id: uuidv7(), rows: [] }).success).toBe(false);
    expect(ImportRosterInput.safeParse({ exam_id: uuidv7(), rows: [RosterRow.parse(good)] }).success).toBe(
      true,
    );
  });
});

describe("seat ranges (assign_proctors)", () => {
  it("accepts ranges that tile the roster from seat 1", () => {
    expect(
      checkSeatRanges([
        { seat_from: 65, seat_to: 128 },
        { seat_from: 1, seat_to: 64 },
      ]),
    ).toBeNull();
    expect(checkSeatRanges([])).toBeNull();
  });

  it("names the first gap or overlap", () => {
    expect(
      checkSeatRanges([
        { seat_from: 1, seat_to: 60 },
        { seat_from: 65, seat_to: 128 },
      ]),
    ).toEqual({
      problem: "gap",
      from: 61,
      to: 64,
    });
    expect(checkSeatRanges([{ seat_from: 5, seat_to: 10 }])).toEqual({ problem: "gap", from: 1, to: 4 });
    expect(
      checkSeatRanges([
        { seat_from: 1, seat_to: 70 },
        { seat_from: 65, seat_to: 128 },
      ]),
    ).toEqual({
      problem: "overlap",
      from: 65,
      to: 70,
    });
  });

  it("checks each row's shape", () => {
    const row = { staff_id: uuidv7(), seat_from: 1, seat_to: 64, languages: ["kk", "ru"] };
    expect(AssignProctorsInput.safeParse({ exam_id: uuidv7(), rows: [row] }).success).toBe(true);
    expect(AssignProctorsInput.safeParse({ exam_id: uuidv7(), rows: [{ ...row, seat_to: 0 }] }).success).toBe(
      false,
    );
    expect(
      AssignProctorsInput.safeParse({ exam_id: uuidv7(), rows: [{ ...row, seat_from: 70 }] }).success,
    ).toBe(false);
    expect(
      AssignProctorsInput.safeParse({ exam_id: uuidv7(), rows: [{ ...row, languages: [] }] }).success,
    ).toBe(false);
  });

  it("reads an assignment, including Phase 0 rows without a range", () => {
    const assignment = {
      exam_id: uuidv7(),
      staff_id: uuidv7(),
      full_name: "Nurlan Bekov",
      seat_from: null,
      seat_to: null,
      languages: ["ru", "en"],
      is_lead: false,
      confirmed_at: null,
      change_request: "Seats 65 to 100 only",
    };
    expect(ProctorAssignment.parse(assignment)).toEqual(assignment);
  });

  it("confirms with no text and asks for a change with text", () => {
    expect(ConfirmSeatsInput.parse({ exam_id: uuidv7() }).change_request).toBeUndefined();
    expect(ConfirmSeatsInput.safeParse({ exam_id: uuidv7(), change_request: "  " }).success).toBe(false);
    expect(ConfirmSeatsInput.safeParse({ exam_id: uuidv7(), change_request: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});

describe("drafts and scheduling (0.4 to 0.5)", () => {
  it("accepts any partial step and refuses unknown fields", () => {
    expect(ExamDraftInput.safeParse({}).success).toBe(true);
    expect(
      ExamDraftInput.safeParse({ title: "Mathematics 2 · Midterm", checks: { gaze_s: 3 } }).success,
    ).toBe(true);
    expect(ExamDraftInput.safeParse({ browser_rules: { calculator: false } }).success).toBe(true);
    expect(ExamDraftInput.safeParse({ browser_rules: { devtools: "blocked" } }).success).toBe(false);
    expect(ExamDraftInput.safeParse({ status: "scheduled" }).success).toBe(false);
    expect(ExamDraftInput.safeParse({ duration_min: 4 }).success).toBe(false);
    expect(ExamDraftInput.safeParse({ lms_url: "exam.kru.test" }).success).toBe(false);
    expect(ExamDraftInput.safeParse({ allowed_sites: ["https://exam.kru.test/x"] }).success).toBe(false);
  });

  it("reads the row save_exam_draft returns", () => {
    const row = {
      id: uuidv7(),
      workspace_id: uuidv7(),
      faculty_id: null,
      title: "",
      course: "",
      kind: "",
      code: null,
      mode: "app",
      starts_at: "2026-10-10T04:00:00+00:00",
      duration_min: 90,
      lobby_opens_at: "2026-10-10T03:40:00+00:00",
      status: "draft",
      checks: DEFAULT_EXAM_CHECKS,
      lms_url: null,
      lms_done_path: null,
      allowed_sites: [],
      created_by: uuidv7(),
      created_at: "2026-10-08T10:00:00.123456+00:00",
      room: null,
      rules_locale: null,
      scheduled_at: null,
      browser_rules: DEFAULT_BROWSER_RULES,
      group_ids: [],
    };
    expect(ExamDraft.parse(row)).toEqual(row);
  });

  it("maps every schedule_exam problem to the step that fixes it", () => {
    expect(parseScheduleError({ message: "seats_uncovered", details: "roster" })).toEqual({
      problem: "seats_uncovered",
      step: "roster",
    });
    expect(parseScheduleError({ message: "lms_url_missing" })?.step).toBe("browser");
    expect(parseScheduleError({ message: "forbidden" })).toBeNull();
    expect(parseScheduleError(null)).toBeNull();
    expect(Object.keys(SCHEDULE_PROBLEMS)).toHaveLength(14);
  });

  it("reads the schedule reply", () => {
    expect(
      ScheduleExamOutput.safeParse({
        code: "MATH2-204-FRI2",
        starts_at: "2026-10-09T05:00:00+00:00",
        lobby_opens_at: "2026-10-09T04:40:00+00:00",
        status: "scheduled",
      }).success,
    ).toBe(true);
  });
});

describe("settings and browser rules", () => {
  it("matches the column defaults", () => {
    expect(WorkspaceSettings.parse(DEFAULT_WORKSPACE_SETTINGS)).toEqual({
      retention_days: 90,
      lobby_minutes: 20,
      default_duration_min: 90,
      default_checks: { gaze_s: 2, phone_score: 0.55, face_missing_s: 10, identity: true, lock: true },
    });
    expect(WorkspaceSettings.safeParse({ ...DEFAULT_WORKSPACE_SETTINGS, retention_days: 0 }).success).toBe(
      false,
    );
    expect(BrowserRules.parse(DEFAULT_BROWSER_RULES)).toEqual({
      copy_paste: true,
      print: true,
      full_screen: true,
      calculator: true,
      other_extensions: "phase2",
      devtools: "managed_only",
      screen_share: "detected",
    });
  });

  it("falls back to every rule on", () => {
    expect(effectiveBrowserRules(undefined)).toEqual(DEFAULT_BROWSER_RULES);
    const rules = { ...DEFAULT_BROWSER_RULES, print: false };
    expect(effectiveBrowserRules(rules)).toBe(rules);
  });

  it("reads the lobby's invite_status, opened included", () => {
    expect(InviteStatus.options).toEqual(["pending", "sent", "failed", "bounced", "opened"]);
  });
});

describe("the wizard's invite inputs (0.3, 0.3b)", () => {
  const exam_id = uuidv7();
  const student_id = uuidv7();

  it("checks 0.3b's address as the roster checks it", () => {
    const base = { exam_id, student_id, roster: true };
    expect(FixInviteEmailInput.parse({ ...base, email: " Y.Tokhtarov@KRU.test " }).email).toBe(
      "y.tokhtarov@kru.test",
    );
    expect(FixInviteEmailInput.safeParse({ ...base, email: "yerlan.kru.test" }).success).toBe(false);
    expect(FixInviteEmailInput.safeParse({ ...base, email: "y@kru.test", extra: 1 }).success).toBe(false);
    expect(FixInviteEmailInput.safeParse({ exam_id, student_id, email: "y@kru.test" }).success).toBe(false);
  });

  it("resends one student's invite", () => {
    expect(ResendInviteInput.parse({ exam_id, student_id })).toEqual({ exam_id, student_id });
    expect(ResendInviteInput.safeParse({ exam_id, student_id: "20230877" }).success).toBe(false);
    expect(ResendInviteInput.safeParse({ exam_id }).success).toBe(false);
  });
});
