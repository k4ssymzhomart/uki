import { describe, expect, it } from "vitest";
import type { StaffLookup } from "../../lib/auth.ts";
import { PROCTORS_LAND_ON_MY_EXAMS, staffHomePath } from "../shell/shell-model.ts";
import {
  homeRedirect,
  landingLocale,
  NAV_LINKS,
  otherLocale,
  SECTION,
  sectionHref,
} from "./landing-model.ts";

const staff = (role: "exam_office" | "proctor" | "admin"): StaffLookup => ({
  status: "staff",
  staff: {
    id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
    email: "dana.akhmetova@kru.test",
    fullName: "Dana Akhmetova",
    role,
    languages: ["ru"],
    workspaceName: "KRU · Kostanay",
    facultyName: null,
  },
});

describe("where / sends people", () => {
  it("keeps visitors on the landing page", () => {
    expect(homeRedirect({ status: "none" })).toBeNull();
  });

  it("sends staff to their home: the overview, and proctors wherever staffHomePath says", () => {
    expect(homeRedirect(staff("exam_office"))).toBe("/overview");
    expect(homeRedirect(staff("admin"))).toBe("/overview");
    expect(homeRedirect(staff("proctor"))).toBe(staffHomePath("proctor"));
    // Until WP 1.5 adds /my-exams, that is the overview too.
    expect(homeRedirect(staff("proctor"))).toBe(PROCTORS_LAND_ON_MY_EXAMS ? "/my-exams" : "/overview");
  });

  it("sends a failed lookup to the overview, which looks again instead of showing marketing", () => {
    expect(homeRedirect({ status: "failed" })).toBe("/overview");
  });
});

describe("the public pages' languages and links", () => {
  it("maps next-intl's tags to English or Russian and switches between them", () => {
    expect(landingLocale("ru-RU")).toBe("ru");
    expect(landingLocale("en-GB")).toBe("en");
    expect(landingLocale("kk-KZ")).toBe("en");
    expect(otherLocale("en")).toBe("ru");
    expect(otherLocale("ru")).toBe("en");
  });

  it("links the header to sections of /, in the frame's order", () => {
    expect(NAV_LINKS.map((link) => sectionHref(link.section))).toEqual([
      "/#product",
      "/#how-it-works",
      "/#privacy",
      "/#universities",
      "/#faq",
    ]);
    expect(new Set(Object.values(SECTION)).size).toBe(Object.values(SECTION).length);
  });
});
