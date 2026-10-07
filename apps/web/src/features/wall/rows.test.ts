import { describe, expect, it } from "vitest";
import { parseQuestionCount } from "./rows.ts";

describe("parseQuestionCount", () => {
  it("reads exam_question_count's answer for the 2.5 drawer", () => {
    expect(parseQuestionCount(20)).toBe(20);
  });

  it("treats null (not exam staff), 0 and anything unreadable as unknown", () => {
    for (const value of [null, undefined, 0, -1, 2.5, "20", { count: 20 }]) {
      expect(parseQuestionCount(value), JSON.stringify(value)).toBeNull();
    }
  });
});
