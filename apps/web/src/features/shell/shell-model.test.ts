import { describe, expect, it } from "vitest";
import { formatGroupCodes, isSameAlmatyDay, minutesUntil } from "../../lib/format.ts";
import { activeNav, isDarkRoute, liveHref, workspaceInitial, workspaceShortName } from "./shell-model.ts";

const exam = "e0000000-0000-4000-8000-000000000001";

describe("shell", () => {
  it("marks Overview on the overview and Live on an exam's lobby and wall", () => {
    expect(activeNav("/overview")).toBe("overview");
    expect(activeNav(`/exams/${exam}/lobby`)).toBe("live");
    expect(activeNav(`/exams/${exam}/live`)).toBe("live");
    expect(activeNav("/sign-in")).toBeNull();
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
