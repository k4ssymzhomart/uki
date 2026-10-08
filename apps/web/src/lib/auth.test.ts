import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSessionRejected,
  lookupStaff,
  requireStaff,
  type StaffLookup,
  type StaffMember,
  staffMemberFromRow,
  staffUserFromClaims,
} from "./auth.ts";
import { hasSupabaseAuthCookie } from "./supabase/proxy.ts";
import { createSupabaseServerClient, type SupabaseServerClient } from "./supabase/server.ts";

vi.mock("./supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
}));

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
    languages: ["ru"],
    workspace: { name: "KRU · Kostanay" },
    faculty: { name: "Faculty of Mathematics" },
  };

  it("reads the staff row with its workspace and faculty", () => {
    expect(staffMemberFromRow(user, row)).toEqual({
      ...user,
      fullName: "Dana Akhmetova",
      role: "exam_office",
      languages: ["ru"],
      workspaceName: "KRU · Kostanay",
      facultyName: "Faculty of Mathematics",
    });
    expect(staffMemberFromRow(user, { ...row, faculty: null })?.facultyName).toBeNull();
  });

  it("is not staff without a matching, well-formed row", () => {
    expect(staffMemberFromRow(user, null)).toBeNull();
    expect(staffMemberFromRow(user, { ...row, id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690000" })).toBeNull();
    expect(staffMemberFromRow(user, { ...row, role: "student" })).toBeNull();
    expect(staffMemberFromRow(user, { ...row, languages: ["de"] })).toBeNull();
  });
});

type ClaimsAnswer = { data: { claims: unknown } | null; error: Error | null } | { throws: Error };
type RowAnswer = { data: unknown; error: { message: string; code: string } | null };

const CLAIMS = { sub, email: "dana.akhmetova@kru.test", is_anonymous: false };
const ROW = {
  id: sub,
  full_name: "Dana Akhmetova",
  role: "exam_office",
  languages: ["ru"],
  workspace: { name: "KRU · Kostanay" },
  faculty: null,
};
const SIGNED_IN: ClaimsAnswer = { data: { claims: CLAIMS }, error: null };
const NO_SESSION: ClaimsAnswer = { data: null, error: null };
const AUTH_DOWN: ClaimsAnswer = { data: null, error: new AuthRetryableFetchError("fetch failed", 0) };
const STAFF_ROW: RowAnswer = { data: ROW, error: null };
const NO_ROW: RowAnswer = { data: null, error: null };
const DB_DOWN: RowAnswer = { data: null, error: { message: "upstream server", code: "" } };

/**
 * A Supabase stand-in for the lookup: getClaims and the staff read answer from their lists in order,
 * the last answer repeating, and count their calls.
 */
function fakeSupabase(claims: ClaimsAnswer[], rows: RowAnswer[] = [STAFF_ROW]) {
  const calls = { claims: 0, rows: 0 };
  const next = <T>(list: T[], index: number): T => list[Math.min(index, list.length - 1)] as T;
  const client = {
    auth: {
      getClaims: async () => {
        const answer = next(claims, calls.claims++);
        if ("throws" in answer) throw answer.throws;
        return answer;
      },
    },
    from: (table: string) => {
      expect(table).toBe("staff");
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => next(rows, calls.rows++),
      };
      return builder;
    },
  };
  return { supabase: client as unknown as SupabaseServerClient, calls };
}

const DANA_STAFF: StaffMember = {
  id: sub,
  email: "dana.akhmetova@kru.test",
  fullName: "Dana Akhmetova",
  languages: ["ru"],
  role: "exam_office",
  workspaceName: "KRU · Kostanay",
  facultyName: null,
};
const DANA: StaffLookup = { status: "staff", staff: DANA_STAFF };

describe("isSessionRejected", () => {
  it("treats a 4xx from Auth as no session", () => {
    expect(isSessionRejected(new AuthInvalidJwtError("Invalid JWT signature"))).toBe(true);
    expect(isSessionRejected(new AuthSessionMissingError())).toBe(true);
    expect(isSessionRejected(new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"))).toBe(
      true,
    );
    expect(isSessionRejected(new AuthApiError("session not found", 403, "session_not_found"))).toBe(true);
  });

  it("treats a network error, a 5xx, a timeout, a race or a rate limit as a failed lookup", () => {
    expect(isSessionRejected(new AuthRetryableFetchError("fetch failed", 0))).toBe(false);
    expect(isSessionRejected(new AuthRetryableFetchError("Bad Gateway", 504))).toBe(false);
    expect(isSessionRejected(new AuthApiError("boom", 500, "unexpected_failure"))).toBe(false);
    expect(isSessionRejected(new AuthUnknownError("not JSON", null))).toBe(false);
    expect(isSessionRejected({ status: 408 })).toBe(false);
    expect(isSessionRejected({ status: 409 })).toBe(false);
    expect(isSessionRejected({ status: 429 })).toBe(false);
  });
});

describe("lookupStaff", () => {
  it("finds the signed-in staff member with one call each", async () => {
    const { supabase, calls } = fakeSupabase([SIGNED_IN]);
    expect(await lookupStaff(supabase, 0)).toEqual(DANA);
    expect(calls).toEqual({ claims: 1, rows: 1 });
  });

  it("is none without a session, for a student, without a staff row, or when Auth rejects the session", async () => {
    const student: ClaimsAnswer = { data: { claims: { sub, is_anonymous: true } }, error: null };
    const expired: ClaimsAnswer = {
      data: null,
      error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    };
    for (const [claims, rows] of [
      [NO_SESSION, STAFF_ROW],
      [student, STAFF_ROW],
      [SIGNED_IN, NO_ROW],
      [expired, STAFF_ROW],
    ] as const) {
      const { supabase, calls } = fakeSupabase([claims], [rows]);
      expect(await lookupStaff(supabase, 0)).toEqual({ status: "none" });
      expect(calls.claims).toBe(1);
    }
  });

  it("retries a failed Auth call once and finds the staff member", async () => {
    const { supabase, calls } = fakeSupabase([AUTH_DOWN, SIGNED_IN]);
    expect(await lookupStaff(supabase, 0)).toEqual(DANA);
    expect(calls).toEqual({ claims: 2, rows: 1 });
  });

  it("retries a failed staff read once and finds the staff member", async () => {
    const { supabase, calls } = fakeSupabase([SIGNED_IN], [DB_DOWN, STAFF_ROW]);
    expect(await lookupStaff(supabase, 0)).toEqual(DANA);
    expect(calls).toEqual({ claims: 2, rows: 2 });
  });

  it("is failed, not none, when Auth or the staff read fails twice, and tries no third time", async () => {
    const auth = fakeSupabase([AUTH_DOWN]);
    expect(await lookupStaff(auth.supabase, 0)).toEqual({ status: "failed" });
    expect(auth.calls).toEqual({ claims: 2, rows: 0 });

    const db = fakeSupabase([SIGNED_IN], [DB_DOWN]);
    expect(await lookupStaff(db.supabase, 0)).toEqual({ status: "failed" });
    expect(db.calls).toEqual({ claims: 2, rows: 2 });

    const thrown = fakeSupabase([{ throws: new TypeError("crypto.subtle failed") }]);
    expect(await lookupStaff(thrown.supabase, 0)).toEqual({ status: "failed" });
    expect(thrown.calls.claims).toBe(2);
  });
});

describe("requireStaff", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("returns the staff member", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fakeSupabase([SIGNED_IN]).supabase);
    expect(await requireStaff()).toEqual(DANA_STAFF);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign-in", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fakeSupabase([NO_SESSION]).supabase);
    await expect(requireStaff()).rejects.toThrow("redirect /sign-in");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("returns null after two failed lookups instead of sending a signed-in proctor to sign-in", async () => {
    const { supabase, calls } = fakeSupabase([AUTH_DOWN]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase);
    expect(await requireStaff()).toBeNull();
    expect(calls.claims).toBe(2);
    expect(redirect).not.toHaveBeenCalled();
  });
});
