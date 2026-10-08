import { describe, expect, it } from "vitest";
import {
  addDays,
  chooseTerm,
  committeeShare,
  decisionSummary,
  flagGroup,
  flagShares,
  formatReviewTime,
  parseRows,
  ratePer100,
  rateTile,
  reviewHeadline,
  reviewSeries,
  shareSize,
  TermKpiRow,
  termOptions,
  termParts,
  termStartOf,
  WeeklyFlagsRow,
  weeklyHeadline,
  weeklySeries,
} from "./reports-model.ts";
import { FRAME_DATA, REVIEW_TIMES, TYPES, WEEKLY } from "./test-fixtures.ts";

const AUTUMN = Date.parse("2026-10-08T06:00:00Z");
const TERMS = [
  { term: "2026-autumn", term_start: "2026-09-01" },
  { term: "2026-spring", term_start: "2026-02-01" },
];

describe("terms", () => {
  it("names and starts a term as WP 1.1's term_key and term_start do", () => {
    expect(termParts("2026-autumn")).toEqual({ season: "autumn", year: "2026" });
    expect(termParts("2027-spring")).toEqual({ season: "spring", year: "2027" });
    expect(termStartOf("2026-autumn")).toBe("2026-09-01");
    expect(termStartOf("2027-spring")).toBe("2027-02-01");
  });

  it("lists each term once, newest first, from term_exams' rows (one per exam)", () => {
    expect(
      termOptions([
        { term: "2026-spring", term_start: "2026-02-01" },
        { term: "2026-autumn", term_start: "2026-09-01" },
        { term: "2026-autumn", term_start: "2026-09-01" },
      ]),
    ).toEqual(TERMS);
  });

  it("shows the address's term when it ran exams, else the current term, else the newest", () => {
    expect(chooseTerm("2026-spring", TERMS, AUTUMN)).toBe("2026-spring");
    expect(chooseTerm("2025-autumn", TERMS, AUTUMN)).toBe("2026-autumn");
    expect(chooseTerm("../../etc", TERMS, AUTUMN)).toBe("2026-autumn");
    expect(chooseTerm(["2026-spring"], TERMS, AUTUMN)).toBe("2026-autumn");
    expect(chooseTerm(undefined, [TERMS[1] as (typeof TERMS)[number]], AUTUMN)).toBe("2026-spring");
    // No exams at all: the current term, with empty cards.
    expect(chooseTerm(undefined, [], Date.parse("2027-03-01T06:00:00Z"))).toBe("2027-spring");
  });

  it("parses the views' rows with Zod and leaves out a row that does not parse", () => {
    expect(
      parseRows(WeeklyFlagsRow, [
        WEEKLY[0],
        { week_start: "1 Sep", sessions: 1, flags: 0, flags_per_100: 0 },
        { ...WEEKLY[1], sessions: -1 },
      ]),
    ).toEqual([WEEKLY[0]]);
    expect(
      parseRows(TermKpiRow, [{ term: "2026-autumn", term_start: "2026-09-01", ...FRAME_DATA.kpis }]),
    ).toHaveLength(1);
  });
});

describe("flags per 100 sessions", () => {
  it("rounds to one decimal as the view does, and has no rate without sessions", () => {
    expect(ratePer100(95, 820)).toBe(11.6);
    expect(ratePer100(343, 3275)).toBe(10.5);
    expect(ratePer100(0, 0)).toBeNull();
    expect(addDays("2026-09-29", 7)).toBe("2026-10-06");
  });

  it("keeps the calendar's weeks, with a week without sessions as a gap", () => {
    expect(weeklySeries(WEEKLY).map((point) => point.rate)).toEqual([11.6, 10.8, 10.1, 9.4, 8.9, 8.4]);
    const gappy = weeklySeries([WEEKLY[0], WEEKLY[2]].filter((row) => row !== undefined));
    expect(gappy.map((point) => [point.week, point.rate])).toEqual([
      ["2026-09-01", 11.6],
      ["2026-09-08", null],
      ["2026-09-15", 10.1],
    ]);
    expect(weeklySeries([])).toEqual([]);
  });

  it("reads A.1's tile: the latest week against the term's first four weeks", () => {
    const series = weeklySeries(WEEKLY);
    expect(rateTile(series, "2026-autumn")).toEqual({
      value: 8.4,
      caption: { kind: "down", from: 10.5, month: "sep" },
    });
    // Still in the first four weeks: the week it is.
    expect(rateTile(series.slice(0, 3), "2026-autumn")).toEqual({
      value: 10.1,
      caption: { kind: "week", week: "2026-09-15" },
    });
    const up = weeklySeries([...WEEKLY.slice(0, 4), { ...WEEKLY[5], flags_per_100: 12 } as never]);
    expect(rateTile(up, "2026-autumn")).toMatchObject({ caption: { kind: "up", from: 10.5 } });
    expect(rateTile([], "2026-autumn")).toEqual({ value: null });
  });

  it("writes the weekly headline from the first week to the latest", () => {
    const series = weeklySeries(WEEKLY);
    expect(weeklyHeadline(series)).toEqual({ kind: "down", first: 11.6, last: 8.4, weeks: 6 });
    expect(weeklyHeadline(series.slice(0, 1))).toEqual({ kind: "single", last: 11.6, week: "2026-09-01" });
    expect(weeklyHeadline([])).toEqual({ kind: "empty" });
  });
});

describe("what gets flagged", () => {
  it("groups the event types as A.1 names them", () => {
    expect(flagGroup("gaze.off_screen")).toBe("looked_away");
    expect(flagGroup("gaze.down")).toBe("looked_away");
    expect(flagGroup("tab.blocked")).toBe("tab_or_site");
    expect(flagGroup("exam.ended_by_proctor")).toBe("other");
  });

  it("gives whole percentages that add up to 100, most first: 46, 18, 14, 12, 6, 4", () => {
    const shares = flagShares([...TYPES].reverse());
    expect(shares.map((share) => [share.group, share.share])).toEqual([
      ["looked_away", 46],
      ["phone", 18],
      ["tab_or_site", 14],
      ["no_face", 12],
      ["second_face", 6],
      ["camera_lost", 4],
    ]);
    expect(flagShares([...TYPES, { type: "gaze.down", flags: 1 }])[0]).toMatchObject({ flags: 224 });
    expect(flagShares([])).toEqual([]);
  });

  it("says how big the top type is", () => {
    expect(shareSize(46)).toBe("almost");
    expect(shareSize(50)).toBe("half");
    expect(shareSize(61)).toBe("majority");
    expect(shareSize(30)).toBe("lead");
  });
});

describe("decisions and review time", () => {
  it("shares the flagged sessions out by decision, with undecided ones as their own part", () => {
    expect(decisionSummary(FRAME_DATA.decisions, 298)).toEqual({
      flagged: 298,
      parts: [
        { key: "no_issue", count: 214, share: 72 },
        { key: "talk", count: 61, share: 20 },
        { key: "committee", count: 23, share: 8 },
      ],
      top: "no_issue",
    });
    const pending = decisionSummary([{ decision: "talk", sessions: 2 }], 4);
    expect(pending.parts.at(-1)).toEqual({ key: "pending", count: 2, share: 50 });
    expect(pending.top).toBe("talk");
    expect(decisionSummary([], 0)).toMatchObject({ flagged: 0, top: null });
  });

  it("reads the median review time per week as hours and minutes", () => {
    const series = reviewSeries(REVIEW_TIMES);
    expect(series.map((point) => formatReviewTime(point.seconds))).toEqual([
      "2:30",
      "2:10",
      "2:05",
      "1:55",
      "1:45",
      "1:40",
    ]);
    expect(reviewHeadline(series)).toEqual({ kind: "faster", first: 9000, last: 6000 });
    expect(reviewHeadline(series.slice(0, 1))).toEqual({ kind: "same", last: 9000 });
    expect(reviewHeadline([...series].reverse())).toMatchObject({ kind: "slower" });
    expect(reviewHeadline([])).toEqual({ kind: "empty" });
    expect(reviewSeries([{ week_start: "2026-09-01", decisions: 0, median_review_s: null }])).toEqual([]);
    expect(formatReviewTime(26 * 3600 + 29)).toBe("26:00");
  });

  it("gives the committee's share of all sessions", () => {
    expect(committeeShare(23, 4912)).toBeCloseTo(0.00468, 5);
    expect(committeeShare(0, 0)).toBeNull();
  });
});
