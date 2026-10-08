import { describe, expect, it } from "vitest";
import { formatGroupCodes, isSameAlmatyDay, minutesUntil } from "../../lib/format.ts";
import {
  activeNav,
  isDarkRoute,
  liveHref,
  NAV,
  NAV_ITEMS,
  type NavId,
  type NavSpec,
  navSections,
  PROCTORS_LAND_ON_MY_EXAMS,
  staffHomePath,
  workspaceInitial,
  workspaceShortName,
} from "./shell-model.ts";

const exam = "e0000000-0000-4000-8000-000000000001";

/** Every item built, as the sidebar will be once 1.8 to 1.12 have landed. */
const ALL_BUILT = Object.fromEntries(
  Object.entries(NAV).map(([id, spec]) => [id, { ...spec, built: true }]),
) as Record<NavId, NavSpec>;

describe("shell", () => {
  it("marks Overview on the overview and Live on an exam's lobby and wall", () => {
    expect(activeNav("/overview")).toBe("overview");
    expect(activeNav(`/exams/${exam}/lobby`)).toBe("live");
    expect(activeNav(`/exams/${exam}/live`)).toBe("live");
    expect(activeNav("/sign-in")).toBeNull();
  });

  it("marks the Phase 1 items on their routes, and Overview on a proctor's /my-exams (0.9)", () => {
    expect(activeNav("/my-exams")).toBe("overview");
    expect(activeNav("/review")).toBe("review");
    expect(activeNav(`/review/${exam}/report`)).toBe("review");
    expect(activeNav("/reports")).toBe("reports");
    expect(activeNav(`/students/${exam}`)).toBe("students");
    expect(activeNav("/settings")).toBe("settings");
    expect(activeNav("/privacy-centre/audit-log")).toBe("privacy");
    // /privacy is the public policy page, not the privacy centre.
    expect(activeNav("/privacy")).toBeNull();
    expect(activeNav("/reviewer")).toBeNull();
  });

  it("lists the items per role as the frames do: 0.1 for the exam office, 0.9 for proctors", () => {
    expect(navSections("exam_office", ALL_BUILT)).toEqual([
      { id: "workspace", items: ["overview", "exams", "live", "review", "reports", "students"] },
      { id: "admin", items: ["settings", "privacy"] },
    ]);
    expect(navSections("admin", ALL_BUILT)).toEqual(navSections("exam_office", ALL_BUILT));
    expect(navSections("proctor", ALL_BUILT)).toEqual([
      { id: "workspace", items: ["overview", "exams", "live", "review", "reports", "students"] },
    ]);
  });

  it("hides every item whose page is not built yet, and the empty Admin section with them", () => {
    const built = (Object.keys(NAV) as NavId[]).filter((id) => NAV[id].built);
    // Each package turns its own item on with its page; Review landed with WP 1.8.
    expect(built).toEqual(expect.arrayContaining(["overview", "exams", "live", "review"]));
    for (const role of ["exam_office", "proctor"] as const) {
      expect(navSections(role).flatMap((section) => section.items)).toEqual(
        NAV_ITEMS.filter((id) => NAV[id].built && NAV[id].roles.includes(role)),
      );
    }
    if (!NAV.settings.built && !NAV.privacy.built) {
      expect(navSections("exam_office").map((section) => section.id)).toEqual(["workspace"]);
    }
  });

  it("lands proctors on /my-exams (0.9) since WP 1.5, and the exam office on the overview", () => {
    expect(PROCTORS_LAND_ON_MY_EXAMS).toBe(true);
    expect(staffHomePath("proctor")).toBe("/my-exams");
    expect(staffHomePath("proctor", false)).toBe("/overview");
    expect(staffHomePath("exam_office")).toBe("/overview");
    expect(staffHomePath("exam_office", true)).toBe("/overview");
    expect(staffHomePath("admin", true)).toBe("/overview");
  });

  it("draws only the live wall dark", () => {
    expect(isDarkRoute(`/exams/${exam}/live`)).toBe(true);
    expect(isDarkRoute(`/exams/${exam}/lobby`)).toBe(false);
    expect(isDarkRoute("/overview")).toBe(false);
  });

  it("sends Live to the live wall, a lobby, or the overview", () => {
    expect(liveHref({ kind: "live", examId: exam })).toBe(`/exams/${exam}/live`);
    expect(liveHref({ kind: "lobby", examId: exam })).toBe(`/exams/${exam}/lobby`);
    expect(liveHref(null)).toBe("/overview");
  });

  it("shortens the workspace as Figma does", () => {
    expect(workspaceInitial("KRU · Kostanay")).toBe("K");
    expect(workspaceShortName("KRU · Kostanay")).toBe("KRU");
    expect(workspaceShortName("Kostanay University")).toBe("Kostanay University");
  });
});

describe("dashboard formatting", () => {
  it("writes group codes as ranges and lists", () => {
    expect(formatGroupCodes(["204"])).toBe("204");
    expect(formatGroupCodes(["103", "101", "102"])).toBe("101–103");
    expect(formatGroupCodes(["101", "102", "103", "204"])).toBe("101–103, 204");
    expect(formatGroupCodes(["101", "102"])).toBe("101, 102");
    expect(formatGroupCodes(["MATH-A", "204", "204"])).toBe("204, MATH-A");
  });

  it("compares calendar days in Asia/Almaty, not UTC", () => {
    // 19:30 UTC is already the next day in Almaty (UTC+5).
    expect(isSameAlmatyDay("2026-10-07T19:30:00Z", "2026-10-08T05:00:00Z")).toBe(true);
    expect(isSameAlmatyDay("2026-10-07T18:30:00Z", "2026-10-08T05:00:00Z")).toBe(false);
  });

  it("rounds minutes left up and never below zero", () => {
    expect(minutesUntil(4 * 60_000 + 1, 0)).toBe(5);
    expect(minutesUntil(4 * 60_000, 0)).toBe(4);
    expect(minutesUntil(0, 60_000)).toBe(0);
  });
});
