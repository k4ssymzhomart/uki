import { describe, expect, it } from "vitest";
import { latestFlag, mergeTimeline, suggestedPreset } from "./drawer-model.ts";
import { formatClock, formatCountdown, toSeconds } from "./durations.ts";
import { examEndsAt, groupExtraMin } from "./exam-end.ts";
import { pronounFromName, shortName } from "./names.ts";
import { event, initialData, iso, NOW, sessionRow } from "./test-helpers.tsx";
import { initialWallState } from "./wall-store.ts";

describe("names", () => {
  it("shortens names as the 2.4 tiles do", () => {
    expect(shortName("Madina Tulegenova")).toBe("Madina T.");
    expect(shortName("Dana Zhaksylykova")).toBe("Dana Zh.");
    expect(shortName("  Aliya  Seitkali ")).toBe("Aliya S.");
    expect(shortName("Ұлжан Әбдіқадыр")).toBe("Ұлжан Ә.");
    expect(shortName("Cher")).toBe("Cher");
    expect(shortName("")).toBe("");
  });

  it("reads the pronoun from the surname, neutral when unsure", () => {
    expect(pronounFromName("Arman Bekzhanov")).toBe("he");
    expect(pronounFromName("Madina Tulegenova")).toBe("she");
    expect(pronounFromName("Aruzhan Kassymova")).toBe("she");
    expect(pronounFromName("Erlan Nurlanuly")).toBe("he");
    expect(pronounFromName("Aliya Seitkali")).toBe("other");
    expect(pronounFromName("")).toBe("other");
  });
});

describe("clocks", () => {
  it("writes pauses, silences and the time left", () => {
    expect(formatClock(42_000)).toBe("00:42");
    expect(formatClock(3_723_000)).toBe("1:02:03");
    expect(formatClock(-5)).toBe("00:00");
    expect(formatCountdown(2_537_000)).toBe("00:42:17");
    expect(formatCountdown(2_536_001)).toBe("00:42:17");
    expect(formatCountdown(-1)).toBe("00:00:00");
    expect(toSeconds(2349)).toBe(2.3);
    expect(toSeconds(6000)).toBe(6);
  });

  it("ends the exam for the group with the minutes everyone got", () => {
    const state = initialWallState(
      initialData([
        sessionRow(1, { extra_min: 10 }),
        sessionRow(2, { extra_min: 15 }),
        sessionRow(3, { extra_min: 0, state: "submitted" }),
      ]),
      NOW,
    );
    const sessions = Object.values(state.sessions);
    expect(groupExtraMin(sessions)).toBe(10);
    expect(examEndsAt(state.exam, sessions).getTime() - NOW).toBe((42 * 60 + 17) * 1000 + 10 * 60_000);
    expect(groupExtraMin([])).toBe(0);
  });

  it("keeps the group's added minutes while a student is still at check-in", () => {
    // issue_command raises extra_min only on rules, ready, writing and paused sessions.
    for (const checkIn of ["joined", "checking", "identity"] as const) {
      const state = initialWallState(
        initialData([
          sessionRow(1, { extra_min: 10 }),
          sessionRow(2, { extra_min: 10, state: "paused" }),
          sessionRow(3, { extra_min: 10, state: "ready" }),
          sessionRow(4, { extra_min: 0, state: checkIn, started_at: null }),
        ]),
        NOW,
      );
      const sessions = Object.values(state.sessions);
      expect(groupExtraMin(sessions)).toBe(10);
      expect(examEndsAt(state.exam, sessions).getTime() - NOW).toBe((42 * 60 + 17) * 1000 + 10 * 60_000);
    }
    const onlyCheckIn = initialWallState(
      initialData([sessionRow(1, { extra_min: 0, state: "identity", started_at: null })]),
      NOW,
    );
    expect(groupExtraMin(Object.values(onlyCheckIn.sessions))).toBe(0);
  });
});

describe("drawer model", () => {
  it("merges the fetched timeline with live events, newest first, without duplicates", () => {
    const a = event(1, "gaze.off_screen", { duration_ms: 2300 }, { at: iso(-300_000) });
    const b = event(1, "phone.detected", { score: 0.94 }, { at: iso(-60_000) });
    const c = event(1, "gaze.on_screen", {}, { at: iso(-49_000), review: "none" });
    const timeline = mergeTimeline([b, a], [c, b]);
    expect(timeline.map((e) => e.id)).toEqual([c.id, b.id, a.id]);
    expect(latestFlag(timeline)?.id).toBe(b.id);
    expect(suggestedPreset(latestFlag(timeline))).toBe("message.preset.phone_away");
    expect(suggestedPreset(a)).toBe("message.preset.camera_view");
    expect(suggestedPreset(undefined)).toBe("message.preset.time_15");
  });
});
