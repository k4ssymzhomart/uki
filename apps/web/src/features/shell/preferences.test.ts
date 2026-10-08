import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffMember } from "../../lib/auth.ts";
import { setDashboardLocale, setOverviewFaculty } from "./preferences.ts";

const store = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => store }));
const auth = vi.hoisted(() => ({ staff: null as StaffMember | null }));
vi.mock("../../lib/auth.ts", () => ({ requireStaff: async () => auth.staff }));

const DANA: StaffMember = {
  id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
  email: "dana.akhmetova@kru.test",
  fullName: "Dana Akhmetova",
  role: "exam_office",
  languages: ["ru"],
  workspaceName: "KRU · Kostanay",
  facultyName: "Faculty of Mathematics",
};
const FACULTY = "fa000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  auth.staff = DANA;
});

describe("3.4a's language switch", () => {
  it("keeps the language in uki_locale for a year, for the whole site, server-only", async () => {
    expect(await setDashboardLocale("ru")).toEqual({ ok: true });
    expect(store.set).toHaveBeenCalledWith(
      "uki_locale",
      "ru",
      expect.objectContaining({ path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true }),
    );
  });

  it("refuses anything but en and ru, and writes nothing without a staff member", async () => {
    expect(await setDashboardLocale("kk")).toEqual({ ok: false, error: "invalid" });
    expect(await setDashboardLocale("ru; Path=/admin")).toEqual({ ok: false, error: "invalid" });
    auth.staff = null;
    expect(await setDashboardLocale("en")).toEqual({ ok: false, error: "failed" });
    expect(store.set).not.toHaveBeenCalled();
  });
});

describe("0.1c's faculty switch", () => {
  it("keeps the faculty in uki_faculty, and All faculties deletes it", async () => {
    expect(await setOverviewFaculty(FACULTY)).toEqual({ ok: true });
    expect(store.set).toHaveBeenCalledWith("uki_faculty", FACULTY, expect.objectContaining({ path: "/" }));
    expect(await setOverviewFaculty(null)).toEqual({ ok: true });
    expect(store.delete).toHaveBeenCalledWith("uki_faculty");
  });

  it("refuses a proctor and a value that is not a faculty id", async () => {
    expect(await setOverviewFaculty("Faculty of Mathematics")).toEqual({ ok: false, error: "invalid" });
    auth.staff = { ...DANA, role: "proctor" };
    expect(await setOverviewFaculty(FACULTY)).toEqual({ ok: false, error: "forbidden" });
    expect(store.set).not.toHaveBeenCalled();
  });
});
