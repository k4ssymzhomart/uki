// The judge path's server routes (user requests of 8 and 9 October; no Figma frame): A.0 Sign in follows
// a safe `?next=` for signed-in staff and fills in `?email=`, and /demo/live sends a visitor to sign-in,
// a staff member to DEMO-LIVE's live wall, and says so when the exam is not there.
import { screen } from "@testing-library/react";
import { notFound, redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { intlErrors, renderWithIntl } from "../../test/render.tsx";
import { findDemoLiveExam } from "../features/demo/demo-live-data.ts";
import { DemoLiveNotice } from "../features/demo/demo-live-notice.tsx";
import { SignInScreen } from "../features/sign-in/sign-in-screen.tsx";
import { getStaffMember, type StaffMember } from "../lib/auth.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";
import SignInPage from "./(auth)/sign-in/page.tsx";
import DemoLivePage from "./(marketing)/demo/live/page.tsx";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));
vi.mock("next/image", () => import("../../test/next-image-mock.tsx"));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(), getLocale: vi.fn(async () => "en-GB") }));
vi.mock("../lib/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/auth.ts")>()),
  getStaffMember: vi.fn(),
}));
vi.mock("../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("../features/demo/demo-live-data.ts", () => ({ findDemoLiveExam: vi.fn() }));

const EXAM = "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690042";

function staff(role: StaffMember["role"]): StaffMember {
  return {
    id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
    email: "dana.akhmetova@kru.test",
    fullName: "Dana Akhmetova",
    role,
    languages: ["ru"],
    workspaceName: "KRU · Kostanay",
    facultyName: null,
  };
}

function signInProps(search: Record<string, string | string[]>) {
  return { params: Promise.resolve({}), searchParams: Promise.resolve(search) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A.0 Sign in with ?email= and ?next=", () => {
  it("passes the checked email and next to the form for a visitor", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "none" });
    const page = await SignInPage(signInProps({ email: "judge@kru.test", next: "/demo/live" }));
    expect(page.type).toBe(SignInScreen);
    expect(page.props).toMatchObject({ email: "judge@kru.test", next: "/demo/live" });
  });

  it("drops a next that leaves the site, and an email that is not one", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "none" });
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example", "/sign-in"]) {
      const page = await SignInPage(signInProps({ email: "judge", next }));
      expect(page.props).toMatchObject({ email: "", next: null });
    }
  });

  it("sends signed-in staff to a safe next, and to their home otherwise", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "staff", staff: staff("exam_office") });
    await expect(SignInPage(signInProps({ next: "/demo/live" }))).rejects.toThrow("redirect /demo/live");
    await expect(SignInPage(signInProps({ next: "//evil.example" }))).rejects.toThrow(
      /^redirect \/overview$/,
    );
    vi.mocked(getStaffMember).mockResolvedValue({ status: "staff", staff: staff("proctor") });
    await expect(SignInPage(signInProps({ next: "https://evil.example" }))).rejects.toThrow(
      /^redirect \/my-exams$/,
    );
    await expect(SignInPage(signInProps({ next: ["/demo/live", "/review"] }))).rejects.toThrow(
      /^redirect \/my-exams$/,
    );
  });

  it("keeps the form, with the next path, when the lookup failed", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "failed" });
    const page = await SignInPage(signInProps({ next: "/demo/live" }));
    expect(page.type).toBe(SignInScreen);
    expect(page.props).toMatchObject({ next: "/demo/live" });
  });
});

describe("/demo/live", () => {
  it("sends a visitor to sign-in, which comes back to /demo/live, without reading any exam", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "none" });
    await expect(DemoLivePage()).rejects.toThrow(/^redirect \/sign-in\?next=\/demo\/live$/);
    expect(findDemoLiveExam).not.toHaveBeenCalled();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("opens DEMO-LIVE's live wall for a signed-in staff member", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "staff", staff: staff("exam_office") });
    vi.mocked(findDemoLiveExam).mockResolvedValue({ status: "found", examId: EXAM });
    await expect(DemoLivePage()).rejects.toThrow(`redirect /exams/${EXAM}/live`);
  });

  it("is a 404 when the exam does not exist yet or this account cannot see it", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "staff", staff: staff("proctor") });
    vi.mocked(findDemoLiveExam).mockResolvedValue({ status: "missing" });
    await expect(DemoLivePage()).rejects.toThrow("not found");
    expect(notFound).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("says it could not reach Üki when the staff lookup or the exam read fails, with Try again", async () => {
    vi.mocked(getStaffMember).mockResolvedValue({ status: "failed" });
    expect((await DemoLivePage()).props).toEqual({ kind: "failed" });
    expect(findDemoLiveExam).not.toHaveBeenCalled();
    vi.mocked(getStaffMember).mockResolvedValue({ status: "staff", staff: staff("exam_office") });
    vi.mocked(findDemoLiveExam).mockResolvedValue({ status: "failed" });
    const page = await DemoLivePage();
    expect(page.type).toBe(DemoLiveNotice);
    renderWithIntl(page);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Could not reach Üki.");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/demo/live");
    expect(intlErrors).toEqual([]);
  });
});
