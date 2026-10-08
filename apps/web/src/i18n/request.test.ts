import { BCP47, formats, TIME_ZONE } from "@uki/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffLookup } from "../lib/auth.ts";
import {
  dashboardLocaleOf,
  LOCALE_COOKIE,
  otherDashboardLocale,
  parseDashboardLocale,
  resolveDashboardLocale,
  staffDefaultLocale,
} from "./locale.ts";
import requestConfig, { requestLocale } from "./request.ts";

// getRequestConfig hands back the factory, so the test calls it as next-intl would for a request.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (factory: () => unknown) => factory,
}));
const jar = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.cookies.has(name) ? { name, value: jar.cookies.get(name) } : undefined),
  }),
}));
const lookup = vi.hoisted(() => ({ current: { status: "none" } as StaffLookup, calls: 0 }));
vi.mock("../lib/auth.ts", () => ({
  getStaffMember: async () => {
    lookup.calls += 1;
    return lookup.current;
  },
}));

type Config = { locale: string; messages: Record<string, unknown>; timeZone: string; formats: unknown };
const config = () => (requestConfig as unknown as () => Promise<Config>)();

function staffWith(languages: ("kk" | "ru" | "en")[]): StaffLookup {
  return {
    status: "staff",
    staff: {
      id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
      email: "dana.akhmetova@kru.test",
      fullName: "Dana Akhmetova",
      role: "exam_office",
      languages,
      workspaceName: "KRU · Kostanay",
      facultyName: null,
    },
  };
}

beforeEach(() => {
  jar.cookies.clear();
  lookup.current = { status: "none" };
  lookup.calls = 0;
});

describe("the dashboard's language", () => {
  it("defaults a staff member to Russian unless their first language is English", () => {
    expect(staffDefaultLocale(["ru"])).toBe("ru");
    expect(staffDefaultLocale(["kk", "ru"])).toBe("ru");
    expect(staffDefaultLocale(["ru", "en"])).toBe("ru");
    expect(staffDefaultLocale(["en", "ru"])).toBe("en");
    expect(staffDefaultLocale([])).toBe("ru");
  });

  it("takes a valid cookie first, then the staff member, then English", () => {
    expect(resolveDashboardLocale("en", ["ru"])).toBe("en");
    expect(resolveDashboardLocale("ru", null)).toBe("ru");
    expect(resolveDashboardLocale("kk", ["ru"])).toBe("ru");
    expect(resolveDashboardLocale("<script>", null)).toBe("en");
    expect(resolveDashboardLocale(undefined, null)).toBe("en");
    expect(parseDashboardLocale("RU")).toBeNull();
  });

  it("maps next-intl's tags back and switches between the two", () => {
    expect(dashboardLocaleOf(BCP47.ru)).toBe("ru");
    expect(dashboardLocaleOf(BCP47.en)).toBe("en");
    expect(otherDashboardLocale("en")).toBe("ru");
    expect(otherDashboardLocale("ru")).toBe("en");
  });
});

describe("the dashboard's next-intl request config", () => {
  it("serves English to a visitor without a cookie, in Asia/Almaty", async () => {
    const result = await config();
    expect(result.locale).toBe(BCP47.en);
    expect(result.timeZone).toBe("Asia/Almaty");
    expect(result.timeZone).toBe(TIME_ZONE);
    expect(result.formats).toBe(formats);
    expect(result.messages).toHaveProperty("language.en", "ENG");
    expect(result.messages).toHaveProperty("dashboard.signIn.submit", "Sign in");
    expect(result.messages).toHaveProperty("dashboard.shell.lookupFailed.retry", "Try again");
  });

  it("serves Russian to a staff member whose first language is Russian", async () => {
    lookup.current = staffWith(["ru"]);
    const result = await config();
    expect(result.locale).toBe(BCP47.ru);
    expect(result.messages).toHaveProperty("dashboard.signIn.submit", "Войти");
    expect(result.messages).toHaveProperty("dashboard.overview.title", "Обзор");
  });

  it("follows the uki_locale cookie over the staff member, without looking them up", async () => {
    lookup.current = staffWith(["ru"]);
    jar.cookies.set(LOCALE_COOKIE, "en");
    expect(await requestLocale()).toBe("en");
    expect(lookup.calls).toBe(0);
    jar.cookies.set(LOCALE_COOKIE, "ru");
    lookup.current = staffWith(["en"]);
    expect((await config()).locale).toBe(BCP47.ru);
  });

  it("ignores a cookie that is not a dashboard language", async () => {
    lookup.current = staffWith(["en", "ru"]);
    jar.cookies.set(LOCALE_COOKIE, "kk");
    expect(await requestLocale()).toBe("en");
    expect(lookup.calls).toBe(1);
  });
});
