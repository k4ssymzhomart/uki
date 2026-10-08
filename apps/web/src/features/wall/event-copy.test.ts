import { EVENT_TYPES, type EventType } from "@uki/contracts";
import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { describeEvent, EVENT_KIND, eventKind, lookAwayRepeat } from "./event-copy.ts";
import { event, iso } from "./test-helpers.tsx";
import type { WallMessage } from "./wall-message.ts";

const t = createTranslator({
  locale: BCP47.en,
  messages: loadMessages("en"),
  namespace: "dashboard.wall",
  timeZone: TIME_ZONE,
  formats,
});
const text = (m: WallMessage | undefined) => (m === undefined ? undefined : t(m.key, m.values));
const STAFF = "a5000000-0000-4000-8000-000000000001";
const context = {
  staffNames: { [STAFF]: "Aigerim Sadykova" },
  presetText: (key: string) => (key === "message.preset.phone_away" ? "Put the phone away" : key),
};

/** Data that passes the contracts' schema for every type. */
const DATA: Partial<Record<EventType, Record<string, unknown>>> = {
  "gaze.off_screen": { duration_ms: 2300, direction: "left" },
  "gaze.down": { duration_ms: 2100 },
  "phone.detected": { score: 0.94, held_ms: 6000 },
  "face.missing": { duration_ms: 12000 },
  "face.second": { duration_ms: 4000, faces: 2 },
  "camera.lost": { reason: "ended" },
  "tab.blocked": { host: null },
  "copy.blocked": { kind: "paste" },
  "site.closed": { host: "chat.openai.com" },
  "net.offline": { offline_ms: 8000, queued: 3 },
  "identity.matched": { score: 0.71, tries: 1 },
  "session.paused": { reason: "face_missing" },
  "session.resumed": { paused_ms: 42000, by: "student" },
  "exam.submitted": { time_used_s: 4932 },
  "proctor.paused": { staff_id: STAFF },
  "proctor.resumed": { staff_id: STAFF },
  "proctor.ended": { staff_id: STAFF, reason: "Second face twice" },
  "proctor.time_added": { minutes: 10, scope: "group", staff_id: STAFF },
  "proctor.message": { preset: "message.preset.phone_away", scope: "student", staff_id: STAFF },
  "student.help_requested": { topic: "technical" },
  "lock.app_disconnected": { side: "app" },
  "lock.fullscreen_exit": { count: 3 },
  "proctor.note": { text: "Phone face down after the warning.", staff_id: STAFF },
};

describe("event wording", () => {
  it("has a title, and a translatable detail and feed label, for every event type", () => {
    for (const type of EVENT_TYPES) {
      const copy = describeEvent(event(1, type, DATA[type] ?? {}), context);
      expect(text(copy.title), type).not.toMatch(/dashboard\.wall/);
      if (copy.feed) expect(text(copy.feed), type).not.toMatch(/dashboard\.wall/);
      if (copy.detail) expect(text(copy.detail), type).not.toMatch(/dashboard\.wall/);
      expect(EVENT_KIND[type], type).toBeDefined();
    }
  });

  it("reads like the 2.4 feed and the 2.5 timeline", () => {
    const off = describeEvent(event(1, "gaze.off_screen", DATA["gaze.off_screen"]), context);
    expect([text(off.title), text(off.feed), text(off.detail)]).toEqual([
      "Looked away",
      "looked away",
      "2.3 s, to the left",
    ]);
    const phone = describeEvent(
      event(1, "phone.detected", DATA["phone.detected"], { frame_count: 3 }),
      context,
    );
    expect([text(phone.title), text(phone.feed), text(phone.detail)]).toEqual([
      "Phone in frame",
      "phone in frame",
      "Confidence 0.94 · frame kept",
    ]);
    expect(text(describeEvent(event(1, "phone.detected", DATA["phone.detected"]), context).detail)).toBe(
      "Confidence 0.94",
    );
    expect(text(describeEvent(event(1, "face.second", DATA["face.second"]), context).detail)).toBe(
      "Someone leaned in for 4 s",
    );
    expect(text(describeEvent(event(1, "gaze.on_screen", {}, { review: "none" }), context).title)).toBe(
      "On screen again",
    );
  });

  it("names a blocked tab, app or the lock's browser tab", () => {
    const lock = event(1, "tab.blocked", { host: null }, { source: "lock" });
    expect(text(describeEvent(lock, context).detail)).toBe("Tried to open a browser tab");
    expect(text(describeEvent(event(1, "tab.blocked", { app: "Telegram" }), context).detail)).toBe(
      "Tried to open Telegram",
    );
    expect(text(describeEvent(event(1, "tab.blocked", { app: null }), context).detail)).toBe(
      "Tried to open another tab or app",
    );
  });

  it("shows proctor events with the staff name, reason, minutes and the preset's English text", () => {
    expect(text(describeEvent(event(1, "proctor.paused", DATA["proctor.paused"]), context).detail)).toBe(
      "By Aigerim Sadykova",
    );
    expect(text(describeEvent(event(1, "proctor.ended", DATA["proctor.ended"]), context).detail)).toBe(
      "Second face twice",
    );
    const added = describeEvent(event(1, "proctor.time_added", DATA["proctor.time_added"]), context);
    expect([text(added.title), text(added.feed), text(added.detail)]).toEqual([
      "Time added · +10 min",
      "time added · +10 min",
      "Everyone",
    ]);
    expect(text(describeEvent(event(1, "proctor.message", DATA["proctor.message"]), context).detail)).toBe(
      "“Put the phone away”",
    );
    const free = event(1, "proctor.message", { text: "Sit up, please", scope: "student" });
    expect(text(describeEvent(free, context).detail)).toBe("“Sit up, please”");
  });

  it("turns the third full-screen exit red", () => {
    expect(eventKind({ type: "lock.fullscreen_exit", review: "log" })).toBe("warn");
    expect(eventKind({ type: "lock.fullscreen_exit", review: "flag" })).toBe("flag");
  });

  it("sums repeated look-aways in the window: Third time, 6 s in total", () => {
    const looks = [-200_000, -100_000, -10_000].map((ms) =>
      event(3, "gaze.off_screen", { duration_ms: 2000, direction: "right" }, { at: iso(ms) }),
    );
    const old = event(3, "gaze.down", { duration_ms: 5000 }, { at: iso(-600_000) });
    const all = [old, ...looks];
    expect(lookAwayRepeat(looks[0] as never, all)).toBeNull();
    expect(text(lookAwayRepeat(looks[2] as never, all) ?? undefined)).toBe("Third time, 6 s in total");
    expect(text(lookAwayRepeat(looks[1] as never, all) ?? undefined)).toBe("Second time, 4 s in total");
    const phone = event(3, "phone.detected", { score: 0.9 });
    expect(lookAwayRepeat(phone, all)).toBeNull();
  });
});
