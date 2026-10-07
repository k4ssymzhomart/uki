import { describe, expect, it } from "vitest";
import { staffMemberFromRow, staffUserFromClaims } from "./auth.ts";
import { hasSupabaseAuthCookie } from "./supabase/proxy.ts";

const sub = "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887";

describe("staffUserFromClaims", () => {
  it("returns staff for a signed-in, non-anonymous user", () => {
    expect(staffUserFromClaims({ sub, email: "dana.akhmetova@kru.test", is_anonymous: false })).toEqual({
      id: sub,
      email: "dana.akhmetova@kru.test",
    });
  });

  it("returns null for a student's anonymous session and for no claims", () => {
    expect(staffUserFromClaims({ sub, is_anonymous: true })).toBeNull();
    expect(staffUserFromClaims(undefined)).toBeNull();
    expect(staffUserFromClaims({ sub: "not-a-uuid" })).toBeNull();
  });
});

describe("hasSupabaseAuthCookie", () => {
  it("finds the auth cookie, chunked or whole", () => {
    expect(hasSupabaseAuthCookie(["sb-127-auth-token"])).toBe(true);
    expect(hasSupabaseAuthCookie(["theme", "sb-abcdefghij-auth-token.0"])).toBe(true);
  });

  it("ignores other cookies, so anonymous requests skip the refresh", () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
    expect(hasSupabaseAuthCookie(["sb-127-auth-token-code-verifier", "NEXT_LOCALE"])).toBe(false);
  });
});

describe("staffMemberFromRow", () => {
  const user = { id: sub, email: "dana.akhmetova@kru.test" };
  const row = {
    id: sub,
    full_name: "Dana Akhmetova",
    role: "exam_office",
    workspace: { name: "KRU · Kostanay" },
    faculty: { name: "Faculty of Mathematics" },
  };

  it("reads the staff row with its workspace and faculty", () => {
    expect(staffMemberFromRow(user, row)).toEqual({
      ...user,
      fullName: "Dana Akhmetova",
      role: "exam_office",
      workspaceName: "KRU · Kostanay",
      facultyName: "Faculty of Mathematics",
    });
    expect(staffMemberFromRow(user, { ...row, faculty: null })?.facultyName).toBeNull();
  });

  it("is not staff without a matching, well-formed row", () => {
    expect(staffMemberFromRow(user, null)).toBeNull();
    expect(staffMemberFromRow(user, { ...row, id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690000" })).toBeNull();
    expect(staffMemberFromRow(user, { ...row, role: "student" })).toBeNull();
  });
});
