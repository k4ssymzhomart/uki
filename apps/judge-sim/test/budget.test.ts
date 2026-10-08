import { describe, expect, it } from "vitest";
import {
  DAILY_MESSAGE_BUDGET,
  DailyBudget,
  FREE_PLAN,
  hourCost,
  monthEstimate,
  watchedHoursAllowed,
} from "../src/budget.ts";

const STUDENTS = 24;
const WELL_INSIDE = 0.6;

describe("the free plan, 30 days of 24/7 running", () => {
  it("idle alone uses little of any quota", () => {
    const month = monthEstimate({ students: STUDENTS, watchedHoursPerDay: 0, viewers: 0 });
    expect(month.realtimeMessages / FREE_PLAN.realtimeMessagesPerMonth).toBeLessThan(0.2);
    expect(month.invocations / FREE_PLAN.edgeFunctionInvocationsPerMonth).toBeLessThan(0.1);
    expect(month.egressBytes / FREE_PLAN.egressBytesPerMonth).toBeLessThan(0.2);
    expect(month.storageBytes / FREE_PLAN.storageBytes).toBeLessThan(0.05);
  });

  it.each([1, 2, 3, 5])(
    "with the daily budget spent every day and %i walls open, every quota stays under 60 %%",
    (viewers) => {
      const hours = watchedHoursAllowed(STUDENTS, viewers);
      expect(hours).toBeGreaterThan(0.5);
      const month = monthEstimate({
        students: STUDENTS,
        watchedHoursPerDay: hours,
        viewers,
        stillViewsPerDay: 200,
      });
      expect(month.realtimeMessages).toBeLessThanOrEqual(DAILY_MESSAGE_BUDGET * 30 + 1);
      expect(month.realtimeMessages / FREE_PLAN.realtimeMessagesPerMonth).toBeLessThan(WELL_INSIDE);
      expect(month.invocations / FREE_PLAN.edgeFunctionInvocationsPerMonth).toBeLessThan(WELL_INSIDE);
      expect(month.egressBytes / FREE_PLAN.egressBytesPerMonth).toBeLessThan(WELL_INSIDE);
      expect(month.storageBytes / FREE_PLAN.storageBytes).toBeLessThan(WELL_INSIDE);
    },
  );

  it("explains why watched cannot run all day: 24 h with one wall would pass the plan", () => {
    const month = monthEstimate({ students: STUDENTS, watchedHoursPerDay: 24, viewers: 1 });
    expect(month.realtimeMessages).toBeGreaterThan(FREE_PLAN.realtimeMessagesPerMonth);
  });

  it("the watched hour is dominated by heartbeats, and heartbeats need no Edge Function", () => {
    const hour = hourCost("watched", STUDENTS);
    expect(hour.heartbeats / hour.broadcasts).toBeGreaterThan(0.7);
    expect(hour.invocations).toBeLessThan(hour.incidents * 2 + hour.answers + hour.asks + 1);
  });

  it("24 anonymous sign-ins fit the project's 30 an hour", () => {
    expect(STUDENTS).toBeLessThan(FREE_PLAN.anonymousSignInsPerHour);
  });
});

describe("DailyBudget", () => {
  const DAY = Date.UTC(2026, 9, 12);

  it("never lets a day pass its limit, even with five walls open all day", () => {
    const budget = new DailyBudget(DAILY_MESSAGE_BUDGET, STUDENTS, DAY);
    const watched = hourCost("watched", STUDENTS).broadcasts / 60;
    const idle = hourCost("idle", STUDENTS).broadcasts / 60;
    let watchedMinutes = 0;
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const now = DAY + minute * 60_000;
      if (budget.allowsWatched(now, 5)) {
        budget.record(watched, 5, now);
        watchedMinutes += 1;
      } else {
        budget.record(idle, 0, now);
      }
    }
    expect(budget.spent(DAY + 24 * 3_600_000 - 1)).toBeLessThanOrEqual(DAILY_MESSAGE_BUDGET);
    expect(watchedMinutes).toBeGreaterThan(30);
  });

  it("starts each UTC day afresh, and a restart keeps the day's count", () => {
    const budget = new DailyBudget(1000, STUDENTS, DAY);
    budget.record(100, 1, DAY + 1000);
    expect(budget.snapshot(DAY + 2000)).toEqual({ day: "2026-10-12", spent: 200 });
    const restarted = new DailyBudget(1000, STUDENTS, DAY + 3000, budget.snapshot(DAY + 2000));
    expect(restarted.spent(DAY + 3000)).toBe(200);
    expect(restarted.spent(DAY + 24 * 3_600_000)).toBe(0);
    expect(
      new DailyBudget(1000, STUDENTS, DAY + 24 * 3_600_000, { day: "2026-10-12", spent: 999 }).spent(
        DAY + 24 * 3_600_000,
      ),
    ).toBe(0);
  });

  it("refuses watched mode once the rest of the day's idle would not fit", () => {
    const budget = new DailyBudget(DAILY_MESSAGE_BUDGET, STUDENTS, DAY);
    expect(budget.allowsWatched(DAY, 1)).toBe(true);
    budget.record(DAILY_MESSAGE_BUDGET - 1000, 0, DAY);
    expect(budget.allowsWatched(DAY + 60_000, 1)).toBe(false);
  });
});
