// Who gets A.2, A.3 and A.4 (plan, Screens: the exam office) and what each page does first: a failed
// staff lookup shows the error and reads nothing, a proctor gets a 404, an id that is not a uuid gets a
// 404, and the exam office's request reads its faculty's students. The settings action refuses proctors
// and settings that do not parse, and writes only the caller's workspace.

import { screen } from "@testing-library/react";
import { DEFAULT_WORKSPACE_SETTINGS } from "@uki/contracts";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../../../test/render.tsx";
import { saveWorkspaceSettings } from "../../../features/settings/settings-actions.ts";
import { loadWorkspaceSettings } from "../../../features/settings/settings-data.ts";
import { loadOverviewScope } from "../../../features/shell/scope-data.ts";
import { loadStudentProfile, loadStudents } from "../../../features/students/students-data.ts";
import { requireStaff, type StaffMember } from "../../../lib/auth.ts";
import { createSupabaseServerClient, type SupabaseServerClient } from "../../../lib/supabase/server.ts";
import SettingsPage from "../settings/page.tsx";
import StudentProfilePage from "./[studentId]/page.tsx";
import StudentsPage from "./page.tsx";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/students",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("../../../lib/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/auth.ts")>()),
  requireStaff: vi.fn(),
}));
vi.mock("../../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("../../../features/shell/scope-data.ts", () => ({ loadOverviewScope: vi.fn() }));
vi.mock("../../../features/students/students-data.ts", () => ({
  loadStudents: vi.fn(),
  loadStudentProfile: vi.fn(),
}));
vi.mock("../../../features/settings/settings-data.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../features/settings/settings-data.ts")>()),
  loadWorkspaceSettings: vi.fn(),
}));

const STUDENT = "b0000000-0000-4000-8000-000020231187";
const WORKSPACE = "a0000000-0000-4000-8000-000000000001";
const MATH = "a1000000-0000-4000-8000-000000000001";

function staff(role: StaffMember["role"]): StaffMember {
  return {
    id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
    email: "dana.akhmetova@kru.test",
    fullName: "Dana Akhmetova",
    role,
    languages: ["ru"],
    workspaceName: "KRU · Kostanay",
    facultyName: "Faculty of Mathematics",
  };
}

const studentsProps = { params: Promise.resolve({}), searchParams: Promise.resolve({ q: "20231187" }) };
const profileProps = (studentId: string) => ({
  params: Promise.resolve({ studentId }),
  searchParams: Promise.resolve({}),
});

/** next/navigation's notFound() throws an error whose digest names the 404. */
async function expectNotFound(page: Promise<unknown>): Promise<void> {
  await expect(page).rejects.toMatchObject({ digest: expect.stringContaining("404") });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A.2, A.3 and A.4 pages", () => {
  it("show the lookup error and read nothing when the staff lookup failed twice", async () => {
    vi.mocked(requireStaff).mockResolvedValue(null);
    for (const page of [
      await StudentsPage(studentsProps as never),
      await StudentProfilePage(profileProps(STUDENT) as never),
      await SettingsPage(),
    ]) {
      const { unmount } = renderWithIntl(page as ReactElement);
      expect(screen.getByRole("alert").textContent).toContain("Could not reach Üki");
      unmount();
    }
    expect(loadStudents).not.toHaveBeenCalled();
    expect(loadStudentProfile).not.toHaveBeenCalled();
    expect(loadWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("give a proctor a 404", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("proctor"));
    await expectNotFound(StudentsPage(studentsProps as never));
    await expectNotFound(StudentProfilePage(profileProps(STUDENT) as never));
    await expectNotFound(SettingsPage());
    expect(loadStudents).not.toHaveBeenCalled();
    expect(loadStudentProfile).not.toHaveBeenCalled();
    expect(loadWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("read the exam office's chosen faculty and the search from the address", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as SupabaseServerClient);
    vi.mocked(loadOverviewScope).mockResolvedValue({
      all: [],
      rows: [],
      faculties: [{ id: MATH, name: "Faculty of Mathematics" }],
      facultyId: MATH,
    });
    vi.mocked(loadStudents).mockResolvedValue({ rows: [], flaggedThisTerm: [] });
    const page = (await StudentsPage(studentsProps as never)) as ReactElement<{
      scopeName: string;
      initialFilters: { query: string };
    }>;
    expect(vi.mocked(loadStudents).mock.calls[0]?.[1]).toBe(MATH);
    expect(page.props.scopeName).toBe("Faculty of Mathematics");
    expect(page.props.initialFilters.query).toBe("20231187");
  });

  it("give a 404 for an id that is not a uuid or a student the staff member may not see", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("admin"));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as SupabaseServerClient);
    await expectNotFound(StudentProfilePage(profileProps("20231187") as never));
    expect(loadStudentProfile).not.toHaveBeenCalled();
    vi.mocked(loadStudentProfile).mockResolvedValue(null);
    await expectNotFound(StudentProfilePage(profileProps(STUDENT) as never));
  });
});

describe("saveWorkspaceSettings", () => {
  function client(answer: { data: unknown; error: { code?: string; message: string } | null }) {
    const calls: [string, unknown[]][] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        calls.push([name, args]);
        return builder;
      };
    const builder = {
      update: record("update"),
      eq: record("eq"),
      select: record("select"),
      maybeSingle: async () => answer,
    };
    const supabase = { from: record("from") };
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as SupabaseServerClient);
    return calls;
  }
  const settings = { ...DEFAULT_WORKSPACE_SETTINGS, default_duration_min: 120 };

  it("writes the workspace's settings for the exam office and returns what was stored", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    const calls = client({ data: { id: WORKSPACE, settings }, error: null });
    expect(await saveWorkspaceSettings({ workspaceId: WORKSPACE, settings })).toEqual({ ok: true, settings });
    expect(calls).toEqual([
      ["from", ["workspaces"]],
      ["update", [{ settings }]],
      ["eq", ["id", WORKSPACE]],
      ["select", ["id, settings"]],
    ]);
  });

  it("refuses a proctor, a failed lookup and settings that do not parse without writing", async () => {
    const calls = client({ data: null, error: null });
    vi.mocked(requireStaff).mockResolvedValue(staff("proctor"));
    expect(await saveWorkspaceSettings({ workspaceId: WORKSPACE, settings })).toEqual({
      ok: false,
      error: "forbidden",
    });
    vi.mocked(requireStaff).mockResolvedValue(null);
    expect(await saveWorkspaceSettings({ workspaceId: WORKSPACE, settings })).toEqual({
      ok: false,
      error: "failed",
    });
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    expect(
      await saveWorkspaceSettings({ workspaceId: WORKSPACE, settings: { ...settings, retention_days: 0 } }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(await saveWorkspaceSettings({ workspaceId: "kru", settings })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(calls).toEqual([]);
  });

  it("answers forbidden when RLS hides the workspace and invalid when the CHECK refuses", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    client({ data: null, error: null });
    expect(await saveWorkspaceSettings({ workspaceId: WORKSPACE, settings })).toEqual({
      ok: false,
      error: "forbidden",
    });
    client({ data: null, error: { code: "23514", message: "workspaces_settings_valid" } });
    expect(await saveWorkspaceSettings({ workspaceId: WORKSPACE, settings })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});
