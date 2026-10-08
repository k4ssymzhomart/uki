import { describe, expect, it } from "vitest";
import { scopedFacultyId, scopesFaculty } from "./scope.ts";

const faculties = [
  { id: "fa000000-0000-4000-8000-000000000001", name: "Faculty of Mathematics" },
  { id: "fa000000-0000-4000-8000-000000000002", name: "Faculty of Physics" },
];

describe("the overview's faculty scope (0.1c)", () => {
  it("gives the switcher to the exam office and admins, not to proctors", () => {
    expect(scopesFaculty("exam_office")).toBe(true);
    expect(scopesFaculty("admin")).toBe(true);
    expect(scopesFaculty("proctor")).toBe(false);
  });

  it("takes the cookie's faculty only when it is one of the workspace's", () => {
    expect(scopedFacultyId("exam_office", faculties[1]?.id, faculties)).toBe(faculties[1]?.id);
    expect(scopedFacultyId("exam_office", undefined, faculties)).toBeNull();
    expect(scopedFacultyId("exam_office", "fa000000-0000-4000-8000-000000000009", faculties)).toBeNull();
    expect(scopedFacultyId("exam_office", "not a uuid", faculties)).toBeNull();
    expect(scopedFacultyId("proctor", faculties[0]?.id, faculties)).toBeNull();
  });
});
