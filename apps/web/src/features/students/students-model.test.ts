import { describe, expect, it } from "vitest";
import {
  filterStudents,
  flagTone,
  matchesQuery,
  NO_FILTERS,
  PAGE_SIZE,
  pageOf,
  parseStudentRows,
  reviewStatus,
  type StudentRow,
  sortStudents,
  studentFacets,
  studentStats,
  studentStatus,
  termKey,
} from "./students-model.ts";
import { filtersFromSearch, filtersToSearch } from "./students-search.ts";

const G204 = "a2000000-0000-4000-8000-000000000204";
const G102 = "a2000000-0000-4000-8000-000000000102";
const MATH = "a1000000-0000-4000-8000-000000000001";
const PHYS = "a1000000-0000-4000-8000-000000000002";

function student(n: number, patch: Partial<StudentRow> = {}): StudentRow {
  return {
    id: `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    student_number: String(20230000 + n),
    full_name: `Student ${n}`,
    group_id: G204,
    group_code: "204",
    faculty_id: MATH,
    programme: "Mathematics",
    year: 2,
    exams_taken: 1,
    flags: 0,
    sessions_in_review: 0,
    last_exam_id: null,
    last_exam_title: null,
    last_exam_at: null,
    latest_decision: null,
    ...patch,
  };
}

const madina = student(1187, { full_name: "Madina Tulegenova", flags: 3, latest_decision: "talk" });
const arman = student(912, { full_name: "Arman Bekzhanov", flags: 2, sessions_in_review: 1 });
const aliya = student(1451, {
  full_name: "Aliya Seitkali",
  group_id: G102,
  group_code: "102",
  faculty_id: PHYS,
  programme: "Physics",
  year: 1,
});

describe("A.2 rows", () => {
  it("parses student_overview rows and leaves out one that does not parse", () => {
    const rows = parseStudentRows([madina, { ...arman, id: "not-a-uuid" }, { ...aliya, flags: -1 }, aliya]);
    expect(rows.map((row) => row.full_name)).toEqual(["Madina Tulegenova", "Aliya Seitkali"]);
  });

  it("derives the status chip: open flags are in review, then the latest decision, else clear", () => {
    expect(studentStatus(madina)).toBe("followUp");
    expect(studentStatus(arman)).toBe("inReview");
    expect(studentStatus(aliya)).toBe("clear");
    expect(studentStatus(student(1, { flags: 1, latest_decision: "no_issue" }))).toBe("noIssue");
    expect(studentStatus(student(2, { flags: 4, latest_decision: "committee" }))).toBe("committee");
    // A flag newer than the decision puts the student back in review.
    expect(studentStatus(student(3, { flags: 2, sessions_in_review: 1, latest_decision: "no_issue" }))).toBe(
      "inReview",
    );
    expect(reviewStatus({ flags: 1, open: false, decision: null })).toBe("inReview");
  });

  it("colours the flag count as A.2 does: 0 neutral, 1 and 2 yellow, 3 and more coral", () => {
    expect([0, 1, 2, 3, 7].map(flagTone)).toEqual(["neutral", "warn", "warn", "flag", "flag"]);
  });
});

describe("A.2 search", () => {
  it("finds Madina by name in any case and order, and by her student number", () => {
    expect(matchesQuery(madina, "Madina")).toBe(true);
    expect(matchesQuery(madina, "  tulegenova   MADINA ")).toBe(true);
    expect(matchesQuery(madina, "20231187")).toBe(true);
    expect(matchesQuery(madina, "1187")).toBe(true);
    expect(matchesQuery(madina, "Arman")).toBe(false);
    expect(matchesQuery(madina, "20230912")).toBe(false);
    expect(matchesQuery(madina, "")).toBe(true);
  });

  it("matches Kazakh and Russian names without regard to case", () => {
    const kazakh = student(5, { full_name: "Әсел Нұрланқызы" });
    expect(matchesQuery(kazakh, "әсел")).toBe(true);
    expect(matchesQuery(kazakh, "НҰРЛАН")).toBe(true);
  });

  it("filters by tab, group, programme, year and search together", () => {
    const rows = [madina, arman, aliya];
    const flagged = new Set([madina.id]);
    const names = (filters: Partial<typeof NO_FILTERS>) =>
      filterStudents(rows, { ...NO_FILTERS, ...filters }, flagged).map((row) => row.full_name);
    expect(names({})).toEqual(["Madina Tulegenova", "Arman Bekzhanov", "Aliya Seitkali"]);
    expect(names({ tab: "flagged" })).toEqual(["Madina Tulegenova"]);
    expect(names({ group: G102 })).toEqual(["Aliya Seitkali"]);
    expect(names({ programme: "Mathematics" })).toEqual(["Madina Tulegenova", "Arman Bekzhanov"]);
    expect(names({ year: 1 })).toEqual(["Aliya Seitkali"]);
    expect(names({ group: G204, query: "arman" })).toEqual(["Arman Bekzhanov"]);
    expect(names({ year: 3 })).toEqual([]);
  });

  it("keeps the search and filters in the address and drops values that do not parse", () => {
    const filters = {
      tab: "flagged" as const,
      query: " Madina ",
      group: G204,
      programme: "Mathematics",
      year: 2,
    };
    const search = filtersToSearch(filters);
    expect(search).toBe(`?q=Madina&group=${G204}&programme=Mathematics&year=2&tab=flagged`);
    expect(filtersFromSearch(Object.fromEntries(new URLSearchParams(search)))).toEqual({
      ...filters,
      query: "Madina",
    });
    expect(filtersToSearch(NO_FILTERS)).toBe("");
    expect(filtersFromSearch({ group: "204", year: "two", tab: "everyone", q: ["20231187", "x"] })).toEqual({
      ...NO_FILTERS,
      query: "20231187",
    });
  });
});

describe("A.2 order, choices, pages and tiles", () => {
  it("lists the most recent exam first, students without an exam last, then by name", () => {
    const rows = [
      student(1, { full_name: "Zarina", last_exam_at: "2026-10-08T05:00:00+00:00" }),
      student(2, { full_name: "Bolat", last_exam_at: null }),
      student(3, { full_name: "Madina", last_exam_at: "2026-10-09T05:00:00+00:00" }),
      student(4, { full_name: "Arman", last_exam_at: "2026-10-09T05:00:00+00:00" }),
    ];
    expect(sortStudents(rows, "en").map((row) => row.full_name)).toEqual([
      "Arman",
      "Madina",
      "Zarina",
      "Bolat",
    ]);
  });

  it("offers each group, programme and year the students have, with how many, in order", () => {
    const rows = [
      madina,
      arman,
      aliya,
      student(9, { group_id: null, group_code: null, programme: null, year: null }),
    ];
    const facets = studentFacets(rows, "en");
    expect(facets.groups).toEqual([
      { value: G102, label: "102", count: 1 },
      { value: G204, label: "204", count: 2 },
    ]);
    expect(facets.programmes.map((f) => [f.value, f.count])).toEqual([
      ["Mathematics", 2],
      ["Physics", 1],
    ]);
    expect(facets.years.map((f) => [f.value, f.count])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("pages the rows and clamps a page past the end", () => {
    const rows = Array.from({ length: 60 }, (_, i) => student(i));
    expect(pageOf(rows, 0)).toMatchObject({ from: 1, to: PAGE_SIZE, total: 60, pageCount: 3, page: 0 });
    expect(pageOf(rows, 2)).toMatchObject({ from: 51, to: 60, page: 2 });
    expect(pageOf(rows, 9).page).toBe(2);
    expect(pageOf([], 0)).toMatchObject({ from: 0, to: 0, total: 0, pageCount: 1, page: 0 });
  });

  it("counts students, their faculties and this term's flagged share", () => {
    const stats = studentStats(
      [madina, arman, aliya, student(7, { faculty_id: null })],
      new Set([madina.id]),
    );
    expect(stats).toEqual({ students: 4, faculties: 2, flagged: 1, flaggedShare: 0.25 });
    expect(studentStats([], new Set()).flaggedShare).toBe(0);
  });

  it("names the term as the database's term_key does, by the date in Asia/Almaty", () => {
    expect(termKey("2026-10-08T06:00:00Z")).toBe("2026-autumn");
    expect(termKey("2027-01-31T10:00:00Z")).toBe("2026-autumn");
    expect(termKey("2027-02-01T10:00:00Z")).toBe("2027-spring");
    // 31 August 20:00 UTC is already 1 September in Almaty.
    expect(termKey("2026-08-31T20:00:00Z")).toBe("2026-autumn");
    expect(termKey("2026-08-31T10:00:00Z")).toBe("2026-spring");
  });
});
