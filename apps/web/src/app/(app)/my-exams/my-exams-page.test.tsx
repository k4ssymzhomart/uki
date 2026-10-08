// /my-exams (0.9) and its confirm_seats action: the proctor's page loads their assignments, the exam
// office goes to its own home, a failed staff lookup shows Try again; the action checks its input with
// Zod, calls confirm_seats and refreshes the page, and maps a refusal to `forbidden`.
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../../../test/render.tsx";
import { loadMyExams } from "../../../features/my-exams/my-exams-data.ts";
import { requireStaff, type StaffMember } from "../../../lib/auth.ts";
import { createSupabaseServerClient, type SupabaseServerClient } from "../../../lib/supabase/server.ts";
import { confirmSeats } from "./actions.ts";
import MyExamsPage from "./page.tsx";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
  usePathname: () => "/my-exams",
  useSearchParams: () => new URLSearchParams(),
}));
const revalidated = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidated.paths.push(path) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
vi.mock("../../../lib/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/auth.ts")>()),
  requireStaff: vi.fn(),
}));
vi.mock("../../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("../../../features/my-exams/my-exams-data.ts", () => ({ loadMyExams: vi.fn(async () => []) }));

const EXAM = "e0000000-0000-4000-8000-000000000001";
const STAFF_ID = "57af0000-0000-4000-8000-000000000002";
const nurlan: StaffMember = {
  id: STAFF_ID,
  email: "nurlan.bekov@kru.test",
  fullName: "Nurlan Bekov",
  role: "proctor",
  languages: ["ru", "en"],
  workspaceName: "KRU · Kostanay",
  facultyName: "Faculty of Mathematics",
};
const ASSIGNMENT = {
  exam_id: EXAM,
  staff_id: STAFF_ID,
  full_name: "Nurlan Bekov",
  seat_from: 65,
  seat_to: 128,
  languages: ["ru", "en"],
  is_lead: false,
  confirmed_at: "2026-10-08T07:01:00+00:00",
  change_request: null,
};

function fakeRpc(answer: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => answer);
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as unknown as SupabaseServerClient);
  return rpc;
}

describe("/my-exams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revalidated.paths = [];
  });

  it("loads the signed-in proctor's own assignments", async () => {
    vi.mocked(requireStaff).mockResolvedValue(nurlan);
    const page = (await MyExamsPage()) as ReactElement<{ exams: unknown[] }>;
    expect(loadMyExams).toHaveBeenCalledWith(STAFF_ID);
    expect(page.props.exams).toEqual([]);
  });

  it("sends the exam office to the overview, its home", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ ...nurlan, role: "exam_office" });
    await expect(MyExamsPage()).rejects.toThrow("redirect /overview");
    expect(loadMyExams).not.toHaveBeenCalled();
  });

  it("shows Try again when the staff lookup failed twice", async () => {
    vi.mocked(requireStaff).mockResolvedValue(null);
    renderWithIntl((await MyExamsPage()) as ReactElement);
    expect(screen.getByRole("alert").textContent).toContain("Could not reach Üki");
    expect(loadMyExams).not.toHaveBeenCalled();
  });
});

describe("confirmSeats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revalidated.paths = [];
    vi.mocked(requireStaff).mockResolvedValue(nurlan);
  });

  it("confirms without text and refreshes /my-exams", async () => {
    const rpc = fakeRpc({ data: ASSIGNMENT, error: null });
    expect(await confirmSeats({ exam_id: EXAM })).toEqual({ ok: true, assignment: ASSIGNMENT });
    expect(rpc).toHaveBeenCalledWith("confirm_seats", { exam_id: EXAM });
    expect(revalidated.paths).toEqual(["/my-exams"]);
  });

  it("asks for a change with the trimmed text", async () => {
    const reply = { ...ASSIGNMENT, confirmed_at: null, change_request: "Seats 1–64" };
    const rpc = fakeRpc({ data: reply, error: null });
    expect(await confirmSeats({ exam_id: EXAM, change_request: "  Seats 1–64 " })).toEqual({
      ok: true,
      assignment: reply,
    });
    expect(rpc).toHaveBeenCalledWith("confirm_seats", { exam_id: EXAM, change_request: "Seats 1–64" });
  });

  it("refuses bad input before the database, and maps the database's refusal", async () => {
    const rpc = fakeRpc({ data: null, error: { message: "forbidden" } });
    expect(await confirmSeats({ exam_id: "not-a-uuid" })).toEqual({ ok: false, error: "failed" });
    expect(await confirmSeats({ exam_id: EXAM, change_request: "x".repeat(501) })).toEqual({
      ok: false,
      error: "failed",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(await confirmSeats({ exam_id: EXAM })).toEqual({ ok: false, error: "forbidden" });
    fakeRpc({ data: { unexpected: true }, error: null });
    expect(await confirmSeats({ exam_id: EXAM })).toEqual({ ok: false, error: "failed" });
    expect(revalidated.paths).toEqual([]);
  });

  it("answers failed without the database when the staff lookup failed", async () => {
    vi.mocked(requireStaff).mockResolvedValue(null);
    expect(await confirmSeats({ exam_id: EXAM })).toEqual({ ok: false, error: "failed" });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
