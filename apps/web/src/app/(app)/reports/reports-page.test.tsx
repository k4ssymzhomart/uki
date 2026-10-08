// Who gets A.1 (plan, Screens: the exam office) and what the page does first: a failed staff lookup
// shows the error and reads nothing, a proctor gets a 404, and the exam office's request reads the
// address's term within the faculty chosen in the workspace menu.

import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../../../test/render.tsx";
import { loadReports } from "../../../features/reports/reports-data.ts";
import { FRAME_DATA, MATH } from "../../../features/reports/test-fixtures.ts";
import { loadOverviewScope } from "../../../features/shell/scope-data.ts";
import { requireStaff, type StaffMember } from "../../../lib/auth.ts";
import { createSupabaseServerClient, type SupabaseServerClient } from "../../../lib/supabase/server.ts";
import ReportsPage from "./page.tsx";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/reports",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("../../../lib/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/auth.ts")>()),
  requireStaff: vi.fn(),
}));
vi.mock("../../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("../../../features/shell/scope-data.ts", () => ({ loadOverviewScope: vi.fn() }));
vi.mock("../../../features/reports/reports-data.ts", () => ({ loadReports: vi.fn() }));

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

const props = { params: Promise.resolve({}), searchParams: Promise.resolve({ term: "2026-spring" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A.1 page", () => {
  it("shows the lookup error and reads nothing when the staff lookup failed twice", async () => {
    vi.mocked(requireStaff).mockResolvedValue(null);
    renderWithIntl((await ReportsPage(props as never)) as ReactElement);
    expect(screen.getByRole("alert").textContent).toContain("Could not reach Üki");
    expect(loadReports).not.toHaveBeenCalled();
  });

  it("gives a proctor a 404 and reads nothing", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("proctor"));
    await expect(ReportsPage(props as never)).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    expect(loadReports).not.toHaveBeenCalled();
  });

  it("reads the address's term within the exam office's chosen faculty", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as SupabaseServerClient);
    vi.mocked(loadOverviewScope).mockResolvedValue({
      all: [],
      rows: [],
      faculties: [{ id: MATH, name: "Faculty of Mathematics" }],
      facultyId: MATH,
    });
    vi.mocked(loadReports).mockResolvedValue(FRAME_DATA);
    const page = (await ReportsPage(props as never)) as ReactElement<{
      facultyId: string;
      workspaceName: string;
    }>;
    const call = vi.mocked(loadReports).mock.calls[0];
    expect(call?.[1]).toBe("2026-spring");
    expect(call?.[2]).toBe(MATH);
    expect(page.props.facultyId).toBe(MATH);
    expect(page.props.workspaceName).toBe("KRU · Kostanay");
  });
});
