import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient, type SupabaseServerClient } from "../../../lib/supabase/server.ts";
import { signIn } from "./actions.ts";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
}));
const cookieStore = vi.hoisted(() => ({ set: vi.fn(), getAll: () => [] }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("../../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));

const ID = "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887";
const EMAIL = "dana.akhmetova@kru.test";
const ROW = {
  id: ID,
  full_name: "Dana Akhmetova",
  role: "exam_office",
  languages: ["ru"],
  workspace: { name: "KRU · Kostanay" },
  faculty: null,
};
type RowAnswer = { data: unknown; error: { message: string } | null };
const DB_DOWN: RowAnswer = { data: null, error: { message: "upstream server" } };

/** Password sign-in that works, then the staff read answering from `rows` in order (the last repeats). */
function fakeSupabase(rows: RowAnswer[]) {
  let reads = 0;
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: ID, email: EMAIL, is_anonymous: false } },
        error: null,
      }),
      signOut,
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => rows[Math.min(reads++, rows.length - 1)],
      };
      return builder;
    },
  };
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client as unknown as SupabaseServerClient);
  return { signOut, reads: () => reads };
}

function form(): FormData {
  const data = new FormData();
  data.set("email", EMAIL);
  data.set("password", "correct horse");
  data.set("keep", "on");
  return data;
}

const INITIAL = { email: "", keep: true, errors: {} };

describe("signIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("goes to the overview when the staff read works on its second try", async () => {
    const db = fakeSupabase([DB_DOWN, { data: ROW, error: null }]);
    await expect(signIn(INITIAL, form())).rejects.toThrow("redirect /overview");
    expect(db.reads()).toBe(2);
    expect(db.signOut).not.toHaveBeenCalled();
  });

  it("sends a proctor to 0.9, /my-exams (WP 1.5)", async () => {
    fakeSupabase([{ data: { ...ROW, full_name: "Nurlan Bekov", role: "proctor" }, error: null }]);
    await expect(signIn(INITIAL, form())).rejects.toThrow("redirect /my-exams");
  });

  it("says sign-in is unavailable, not that the account cannot use the dashboard, when the read fails twice", async () => {
    const db = fakeSupabase([DB_DOWN]);
    expect(await signIn(INITIAL, form())).toEqual({
      email: EMAIL,
      keep: true,
      errors: { password: "unavailable" },
    });
    expect(db.reads()).toBe(2);
    expect(db.signOut).toHaveBeenCalledOnce();
  });

  it("still refuses an account without a staff row", async () => {
    const db = fakeSupabase([{ data: null, error: null }]);
    expect(await signIn(INITIAL, form())).toEqual({
      email: EMAIL,
      keep: true,
      errors: { email: "notStaff" },
    });
    expect(db.reads()).toBe(1);
    expect(db.signOut).toHaveBeenCalledOnce();
  });
});
