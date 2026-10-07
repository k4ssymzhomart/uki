import { describe, expect, it } from "vitest";
import { isDoneUrl, isExamDone, isPastDeadline, releaseDeadlineMs } from "./release.ts";

const exam = {
  lms_url: "http://localhost:5180/physics-1/quiz-3",
  done_path: "/physics-1/quiz-3/review",
  ends_at: "2026-10-07T09:40:00Z",
};

describe("release triggers", () => {
  it("knows the finish page: same host and port, the done path or below it", () => {
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/review", exam)).toBe(true);
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/review/", exam)).toBe(true);
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/review?attempt=1#top", exam)).toBe(true);
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/review/summary", exam)).toBe(true);
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/attempt", exam)).toBe(false);
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/reviewer", exam)).toBe(false);
    expect(isDoneUrl("http://localhost:3000/physics-1/quiz-3/review", exam)).toBe(false);
    expect(isDoneUrl("http://evil.example/physics-1/quiz-3/review", exam)).toBe(false);
    expect(isDoneUrl("chrome://newtab/", exam)).toBe(false);
    expect(isDoneUrl(undefined, exam)).toBe(false);
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/review", { ...exam, done_path: null })).toBe(
      false,
    );
  });

  it("accepts a done path given as a full URL", () => {
    const full = { ...exam, done_path: "https://exam.kru.test/physics-1/quiz-3/review" };
    expect(isDoneUrl("https://exam.kru.test/physics-1/quiz-3/review", full)).toBe(true);
    expect(isDoneUrl("http://localhost:5180/physics-1/quiz-3/review", full)).toBe(false);
  });

  it("releases at the end time plus 2 minutes", () => {
    const end = Date.parse(exam.ends_at);
    expect(releaseDeadlineMs(exam)).toBe(end + 120_000);
    expect(isPastDeadline(exam, end + 119_999)).toBe(false);
    expect(isPastDeadline(exam, end + 120_000)).toBe(true);
  });

  it("treats exam.state done for the locked session as the end", () => {
    const sessionId = "0192f3a0-0000-7000-8000-000000000001";
    expect(isExamDone({ phase: "done", exam: { session_id: sessionId } }, sessionId)).toBe(true);
    expect(isExamDone({ phase: "done", exam: null }, sessionId)).toBe(true);
    expect(isExamDone({ phase: "writing", exam: { session_id: sessionId } }, sessionId)).toBe(false);
    expect(isExamDone({ phase: "done", exam: { session_id: "other" } }, sessionId)).toBe(false);
  });
});
