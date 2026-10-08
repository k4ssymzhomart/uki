import { buildExamCode, DEFAULT_BROWSER_RULES, DEFAULT_EXAM_CHECKS, type ExamDraft } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import {
  addMonths,
  allowedStep,
  almatyParts,
  applyPatch,
  assignmentRows,
  checkChips,
  courseSuggestions,
  examDraftFromRow,
  examTimes,
  FixInviteEmailInput,
  fromAlmaty,
  groupFromRow,
  inTab,
  inviteAction,
  inviteChip,
  lmsHost,
  matchesSearch,
  mergePatch,
  monthGrid,
  nextSeatRange,
  nextStep,
  normaliseHost,
  parseSeatError,
  parseWizardStep,
  previousStep,
  proctorOfSeat,
  removeProctor,
  scheduleFailure,
  seatProblem,
  stepperStates,
  uncoveredSeats,
  upsertProctor,
  withCurrent,
  wizardSteps,
} from "./wizard-model.ts";

const EXAM_ID = "e1000000-0000-4000-8000-000000000001";

function draft(overrides: Partial<ExamDraft> = {}): ExamDraft {
  return {
    id: EXAM_ID,
    workspace_id: "a0000000-0000-4000-8000-000000000001",
    faculty_id: null,
    title: "Mathematics 2 · Midterm",
    course: "Mathematics 2",
    kind: "Midterm",
    code: null,
    mode: "app",
    starts_at: "2026-10-09T05:00:00Z",
    duration_min: 90,
    lobby_opens_at: "2026-10-09T04:40:00Z",
    status: "draft",
    checks: { ...DEFAULT_EXAM_CHECKS },
    lms_url: null,
    lms_done_path: null,
    allowed_sites: [],
    created_by: null,
    created_at: "2026-10-08T04:12:00Z",
    room: null,
    rules_locale: null,
    scheduled_at: null,
    browser_rules: { ...DEFAULT_BROWSER_RULES },
    group_ids: [],
    ...overrides,
  };
}

describe("steps", () => {
  it("has E.1 only for a browser exam", () => {
    expect(wizardSteps("app")).toEqual(["details", "checks", "roster", "review"]);
    expect(wizardSteps("browser")).toEqual(["details", "checks", "browser", "roster", "review"]);
  });

  it("sends Next from Checks to E.1 for a browser exam and to Students otherwise", () => {
    expect(nextStep("details", "app")).toBe("checks");
    expect(nextStep("checks", "app")).toBe("roster");
    expect(nextStep("checks", "browser")).toBe("browser");
    expect(nextStep("browser", "browser")).toBe("roster");
    expect(nextStep("roster", "browser")).toBe("review");
    expect(nextStep("review", "app")).toBeNull();
  });

  it("leaves E.1 for Students even after the exam was switched to the app there", () => {
    expect(nextStep("browser", "app")).toBe("roster");
    expect(previousStep("browser", "app")).toBe("checks");
  });

  it("sends Back the other way", () => {
    expect(previousStep("roster", "browser")).toBe("browser");
    expect(previousStep("roster", "app")).toBe("checks");
    expect(previousStep("details", "app")).toBeNull();
  });

  it("draws E.1 as the Checks step of the four-step stepper", () => {
    expect(stepperStates("browser")).toEqual({
      details: "done",
      checks: "current",
      roster: "upcoming",
      review: "upcoming",
    });
    expect(stepperStates("review")).toEqual({
      details: "done",
      checks: "done",
      roster: "done",
      review: "current",
    });
  });

  it("reads a step from the URL", () => {
    expect(parseWizardStep("roster")).toBe("roster");
    expect(parseWizardStep("lobby")).toBeNull();
  });

  it("opens every page of a draft, only the roster of a scheduled exam, and none of a live one", () => {
    expect(allowedStep(draft(), "details")).toEqual({ ok: true });
    expect(allowedStep(draft(), "browser")).toEqual({ ok: false, redirect: "checks" });
    expect(allowedStep(draft({ mode: "browser" }), "browser")).toEqual({ ok: true });
    expect(allowedStep(draft({ status: "scheduled" }), "roster")).toEqual({ ok: true });
    expect(allowedStep(draft({ status: "scheduled" }), "review")).toEqual({ ok: false, redirect: "roster" });
    expect(allowedStep(draft({ status: "live" }), "roster")).toEqual({ ok: false, redirect: "lobby" });
  });
});

describe("rows from the database", () => {
  it("reads an exams row with its exam_groups embed", () => {
    const { group_ids: _ids, ...row } = draft();
    const exam = examDraftFromRow({
      ...row,
      exam_groups: [{ group_id: "a2000000-0000-4000-8000-000000000204" }],
    });
    expect(exam?.group_ids).toEqual(["a2000000-0000-4000-8000-000000000204"]);
    expect(examDraftFromRow({ id: "nope" })).toBeNull();
  });

  it("reads a group with PostgREST's count embed", () => {
    expect(
      groupFromRow({ id: "a2000000-0000-4000-8000-000000000204", code: "204", students: [{ count: 128 }] }),
    ).toEqual({ id: "a2000000-0000-4000-8000-000000000204", code: "204", students: 128 });
  });

  it("offers each course once, sorted", () => {
    expect(courseSuggestions(["Physics 1", "Mathematics 2", " Mathematics 2 ", ""])).toEqual([
      "Mathematics 2",
      "Physics 1",
    ]);
  });
});

describe("date and time in Asia/Almaty", () => {
  it("splits an instant into the Almaty day and time", () => {
    expect(almatyParts("2026-10-09T05:00:00Z")).toEqual({ date: "2026-10-09", time: "10:00" });
    expect(almatyParts("2026-10-08T20:30:00Z")).toEqual({ date: "2026-10-09", time: "01:30" });
  });

  it("turns an Almaty day and time back into UTC", () => {
    expect(fromAlmaty("2026-10-09", "10:00")).toBe("2026-10-09T05:00:00.000Z");
    expect(fromAlmaty("2026-10-09", "01:30")).toBe("2026-10-08T20:30:00.000Z");
    expect(fromAlmaty("2026-10-09", "25:00")).toBeNull();
    expect(fromAlmaty("9 Oct", "10:00")).toBeNull();
  });

  it("draws October 2026 Monday first, as the date picker frame does", () => {
    const weeks = monthGrid("2026-10");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.map((day) => day.day)).toEqual([28, 29, 30, 1, 2, 3, 4]);
    expect(weeks[0]?.[0]?.inMonth).toBe(false);
    expect(weeks[4]?.map((day) => day.day)).toEqual([26, 27, 28, 29, 30, 31, 1]);
  });

  it("moves between months across a year", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("works out At a glance: lobby 20 minutes before, end after the duration", () => {
    expect(examTimes("2026-10-09T05:00:00Z", 90, 20)).toEqual({
      lobbyOpensAt: "2026-10-09T04:40:00.000Z",
      endsAt: "2026-10-09T06:30:00.000Z",
    });
  });
});

describe("choices", () => {
  it("keeps the current value on a select's list", () => {
    expect(withCurrent([30, 60, 90], 75)).toEqual([30, 60, 75, 90]);
    expect(withCurrent(["Midterm", "Final"], "Reading")).toEqual(["Midterm", "Final", "Reading"]);
    expect(withCurrent(["Midterm"], "")).toEqual(["Midterm"]);
  });

  it("reads the exam's own host and the sites typed into Add site", () => {
    expect(lmsHost("https://exam.kru.test/physics-1/quiz-3")).toBe("exam.kru.test");
    expect(lmsHost("not a url")).toBeNull();
    expect(normaliseHost(" HTTPS://Library.KRU.test/books?q=1 ")).toBe("library.kru.test");
    expect(normaliseHost("localhost:5180")).toBe("localhost:5180");
    expect(normaliseHost("two words")).toBeNull();
  });
});

describe("proctors", () => {
  const AIGERIM = "3fe31f39-082e-4f21-9dc8-ecfd979457ea";
  const NURLAN = "4f70782f-9a20-4f82-b900-de5440c1a674";
  const assignment = (staff_id: string, seat_from: number, seat_to: number) => ({
    exam_id: EXAM_ID,
    staff_id,
    full_name: staff_id === AIGERIM ? "Aigerim Sadykova" : "Nurlan Bekov",
    seat_from,
    seat_to,
    languages: ["kk" as const, "ru" as const],
    is_lead: seat_from === 1,
    confirmed_at: null,
    change_request: null,
  });

  it("suggests the seats after the last range, up to the roster's end", () => {
    expect(nextSeatRange([], 24)).toEqual({ from: 1, to: 24 });
    const rows = assignmentRows([assignment(AIGERIM, 1, 12)]);
    expect(nextSeatRange(rows, 24)).toEqual({ from: 13, to: 24 });
    expect(uncoveredSeats(rows, 24)).toEqual({ from: 13, to: 24 });
    expect(uncoveredSeats(rows, 12)).toBeNull();
  });

  it("finds the gaps and overlaps assign_proctors refuses", () => {
    const aigerim = { staff_id: AIGERIM, seat_from: 1, seat_to: 12, languages: ["kk" as const] };
    expect(
      seatProblem(upsertProctor([aigerim], { ...aigerim, staff_id: NURLAN, seat_from: 13, seat_to: 24 })),
    ).toBeNull();
    expect(
      seatProblem(upsertProctor([aigerim], { ...aigerim, staff_id: NURLAN, seat_from: 15, seat_to: 24 })),
    ).toEqual({
      problem: "gap",
      from: 13,
      to: 14,
    });
    expect(
      seatProblem(upsertProctor([aigerim], { ...aigerim, staff_id: NURLAN, seat_from: 10, seat_to: 24 })),
    ).toEqual({
      problem: "overlap",
      from: 10,
      to: 12,
    });
  });

  it("replaces one proctor's row and drops the lead flag when a proctor goes", () => {
    const rows = assignmentRows([assignment(NURLAN, 13, 24), assignment(AIGERIM, 1, 12)]);
    expect(rows.map((row) => row.staff_id)).toEqual([AIGERIM, NURLAN]);
    expect(upsertProctor(rows, { ...rows[0], seat_to: 10 } as (typeof rows)[number])[0]?.seat_to).toBe(10);
    expect(removeProctor(rows, AIGERIM)).toEqual([
      { staff_id: NURLAN, seat_from: 13, seat_to: 24, languages: ["kk", "ru"] },
    ]);
  });

  it("reads assign_proctors' error", () => {
    expect(parseSeatError({ message: "gap", details: "seats 13 to 14" })).toEqual({
      problem: "gap",
      from: 13,
      to: 14,
    });
    expect(parseSeatError({ message: "bad_request" })).toBeNull();
  });

  it("names the proctor of a seat", () => {
    const list = [assignment(AIGERIM, 1, 12), assignment(NURLAN, 13, 24)];
    expect(proctorOfSeat(list, 12)?.full_name).toBe("Aigerim Sadykova");
    expect(proctorOfSeat(list, 13)?.full_name).toBe("Nurlan Bekov");
    expect(proctorOfSeat(list, 25)).toBeNull();
  });
});

describe("invites in the students table", () => {
  it("shows 0.3a's Not sent before the import and 0.3's chips after", () => {
    expect(inviteChip("parsed")).toEqual({ status: "idle", key: "notSent" });
    expect(inviteChip("sent")).toEqual({ status: "idle", key: "sent" });
    expect(inviteChip("opened")).toEqual({ status: "ok", key: "opened" });
    expect(inviteChip("bounced")).toEqual({ status: "flag", key: "bounced" });
  });

  it("offers Edit before the invite goes out, Fix email when it bounced, Resend after it went out", () => {
    expect(inviteAction("pending")).toBe("edit");
    expect(inviteAction("bounced")).toBe("fixEmail");
    expect(inviteAction("failed")).toBe("fixEmail");
    expect(inviteAction("sent")).toBe("resend");
  });

  it("filters by tab and by name or number", () => {
    expect(inTab("sent", "notOpened")).toBe(true);
    expect(inTab("opened", "notOpened")).toBe(false);
    expect(inTab("opened", "invited")).toBe(true);
    expect(inTab("pending", "invited")).toBe(false);
    const madina = { full_name: "Madina Tulegenova", student_number: "20231187" };
    expect(matchesSearch(madina, "madina")).toBe(true);
    expect(matchesSearch(madina, "1187")).toBe(true);
    expect(matchesSearch(madina, "dias")).toBe(false);
  });

  it("checks 0.3b's address before it leaves the browser", () => {
    const base = { exam_id: EXAM_ID, student_id: EXAM_ID, roster: true };
    expect(FixInviteEmailInput.safeParse({ ...base, email: " Y.Tokhtarov@KRU.test " }).data?.email).toBe(
      "y.tokhtarov@kru.test",
    );
    expect(FixInviteEmailInput.safeParse({ ...base, email: "yerlan.kru.test" }).success).toBe(false);
  });
});

describe("review", () => {
  it("lists 0.5's check chips, with the microphone always off", () => {
    expect(checkChips(draft()).map((chip) => [chip.key, chip.on, chip.value])).toEqual([
      ["lock", true, undefined],
      ["gaze", true, 2],
      ["phone", true, 0.85],
      ["identity", true, undefined],
      ["secondPerson", true, undefined],
      ["microphone", false, undefined],
    ]);
  });

  it("maps a schedule_exam error to the step that fixes it", () => {
    expect(scheduleFailure({ message: "roster_empty", details: "roster" })).toEqual({
      problem: "roster_empty",
      step: "roster",
    });
    expect(scheduleFailure({ message: "lms_url_missing" })).toEqual({
      problem: "lms_url_missing",
      step: "browser",
    });
    expect(scheduleFailure({ message: "forbidden" })).toBeNull();
  });

  it("previews the code students will type, as schedule_exam makes it", () => {
    expect(
      buildExamCode({
        course: "Mathematics 2",
        groups: ["204"],
        startsAt: "2026-10-09T05:00:00Z",
        timeZone: "Asia/Almaty",
      }),
    ).toBe("MATH2-204-FRI");
  });
});

describe("the draft's saves", () => {
  it("merges checks and browser rules the way save_exam_draft does, and keeps the last other value", () => {
    expect(
      mergePatch(
        { title: "A", checks: { lock: false }, browser_rules: { print: false } },
        { title: "B", checks: { gaze_s: 3 }, browser_rules: { calculator: false } },
      ),
    ).toEqual({
      title: "B",
      checks: { lock: false, gaze_s: 3 },
      browser_rules: { print: false, calculator: false },
    });
  });

  it("shows a patch at once", () => {
    const next = applyPatch(draft(), { checks: { identity: false }, title: null, duration_min: 60 });
    expect(next.checks).toEqual({ ...DEFAULT_EXAM_CHECKS, identity: false });
    expect(next.title).toBe("");
    expect(next.duration_min).toBe(60);
  });
});
