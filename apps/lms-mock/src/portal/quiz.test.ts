import { describe, expect, it } from "vitest";
import { isLocked } from "./lock-state.ts";
import {
  answer,
  answeredCount,
  finish,
  loadAttempt,
  minutesTaken,
  newAttempt,
  QUESTIONS,
  saveAttempt,
} from "./quiz.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("the attempt", () => {
  it("counts answers, keeps the latest choice and finishes once", () => {
    let attempt = newAttempt(0);
    attempt = answer(attempt, "q1", 1, 1000);
    attempt = answer(attempt, "q1", 2, 2000);
    attempt = answer(attempt, "q4", 1, 3000);
    expect(answeredCount(attempt)).toBe(2);
    expect(attempt.answers.q1).toBe(2);
    expect(attempt.savedAt).toBe(3000);
    const done = finish(attempt, 38 * 60_000);
    expect(finish(done, 99 * 60_000).finishedAt).toBe(38 * 60_000);
    expect(minutesTaken(done)).toBe(38);
    expect(QUESTIONS.every((q) => q.choices.length === 4)).toBe(true);
  });

  it("survives a reload through sessionStorage and ignores garbage", () => {
    const storage = memoryStorage();
    expect(loadAttempt(storage)).toBeNull();
    const attempt = answer(newAttempt(5), "q2", 2, 6);
    saveAttempt(storage, attempt);
    expect(loadAttempt(storage)).toEqual(attempt);
    storage.setItem("kru-mock:physics-1/quiz-3", "{oops");
    expect(loadAttempt(storage)).toBeNull();
  });

  it("knows when Üki Lock has locked the page", () => {
    expect(isLocked({ getAttribute: () => "locked" })).toBe(true);
    expect(isLocked({ getAttribute: () => null })).toBe(false);
  });
});
