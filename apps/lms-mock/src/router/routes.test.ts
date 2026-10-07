import { describe, expect, it } from "vitest";
import { HOME, matchRoute, ROUTES } from "./routes.ts";

describe("matchRoute", () => {
  it("finds the three portal pages, with or without a trailing slash", () => {
    expect(matchRoute("/physics-1/quiz-3")).toBe("quiz");
    expect(matchRoute("/physics-1/quiz-3/attempt/")).toBe("attempt");
    expect(matchRoute("/physics-1/quiz-3/review")).toBe("review");
  });

  it("matches nothing else, and the root goes to the quiz page", () => {
    expect(matchRoute("/")).toBeNull();
    expect(matchRoute("/physics-1")).toBeNull();
    expect(matchRoute("/physics-1/quiz-3/review/extra")).toBeNull();
    expect(HOME).toBe(ROUTES.quiz);
  });

  it("keeps the review path the seed uses as lms_done_path", () => {
    expect(ROUTES.review).toBe("/physics-1/quiz-3/review");
  });
});
