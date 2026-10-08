// What every dashboard entry point does when the staff lookup failed twice (lib/auth.ts): pages show the
// error with Try again and load nothing, the (app) layout shows it without the shell, Start exam answers
// `failed`, and nothing sends the proctor to sign-in. Without a staff session, `/` shows the landing page.
import { screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../test/render.tsx";
import { loadLobby } from "../features/lobby/lobby-data.ts";
import { loadOverviewRows } from "../features/overview/overview-data.ts";
import { SignInScreen } from "../features/sign-in/sign-in-screen.tsx";
import { loadWall } from "../features/wall/load-wall.ts";
import { getStaffMember, requireStaff } from "../lib/auth.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";
import LiveWallPage from "./(app)/exams/[examId]/live/page.tsx";
import { startExam } from "./(app)/exams/[examId]/lobby/actions.ts";
import LobbyPage from "./(app)/exams/[examId]/lobby/page.tsx";
import AppLayout from "./(app)/layout.tsx";
import OverviewPage from "./(app)/overview/page.tsx";
import SignInPage from "./(auth)/sign-in/page.tsx";
import HomePage from "./(marketing)/page.tsx";

const location = vi.hoisted(() => ({ pathname: "/overview" }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => import("../../test/next-image-mock.tsx"));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(), getLocale: vi.fn(async () => "en-GB") }));
vi.mock("../lib/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/auth.ts")>()),
  getStaffMember: vi.fn(),
  requireStaff: vi.fn(),
}));
vi.mock("../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("../features/overview/overview-data.ts", () => ({
  loadOverviewRows: vi.fn(),
  loadGroupCount: vi.fn(),
  loadBouncedInvites: vi.fn(),
}));
vi.mock("../features/lobby/lobby-data.ts", () => ({ loadLobby: vi.fn() }));
vi.mock("../features/wall/load-wall.ts", () => ({ loadWall: vi.fn() }));

const EXAM = "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690001";
const examProps = { params: Promise.resolve({ examId: EXAM }), searchParams: Promise.resolve({}) };

/** Renders a page's answer, checks it is the error with Try again to `href`, and unmounts it. */
function expectTryAgain(ui: ReactElement, href: string): void {
  const { unmount } = renderWithIntl(ui);
  expect(screen.getByRole("alert").textContent).toContain("Could not reach Üki");
  expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(href);
  unmount();
}

describe("a failed staff lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaff).mockResolvedValue(null);
    vi.mocked(getStaffMember).mockResolvedValue({ status: "failed" });
  });

  it("shows the layout's full-screen error instead of the shell and the page", async () => {
    location.pathname = "/overview";
    renderWithIntl(await AppLayout({ children: <p>page</p> }));
    expect(screen.getByRole("alert").textContent).toContain("Could not reach Üki");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/overview");
    expect(screen.queryByText("page")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(loadOverviewRows).not.toHaveBeenCalled();
  });

  it("shows the error on the overview, lobby and live wall, and loads nothing", async () => {
    location.pathname = "/overview";
    expectTryAgain(await OverviewPage(), "/overview");
    location.pathname = `/exams/${EXAM}/lobby`;
    expectTryAgain(await LobbyPage(examProps), `/exams/${EXAM}/lobby`);
    location.pathname = `/exams/${EXAM}/live`;
    expectTryAgain((await LiveWallPage(examProps)) as ReactElement, `/exams/${EXAM}/live`);
    expect(loadOverviewRows).not.toHaveBeenCalled();
    expect(loadLobby).not.toHaveBeenCalled();
    expect(loadWall).not.toHaveBeenCalled();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("makes Start exam answer failed without calling the database", async () => {
    expect(await startExam({ exam_id: EXAM })).toEqual({ error: "failed" });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("sends `/` to the overview, which looks again, and leaves the sign-in form in place", async () => {
    await expect(HomePage()).rejects.toThrow("redirect /overview");
    expect((await SignInPage()).type).toBe(SignInScreen);
  });

  it("shows visitors without a staff session the landing page instead of redirecting", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "none" });
    await expect(HomePage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
