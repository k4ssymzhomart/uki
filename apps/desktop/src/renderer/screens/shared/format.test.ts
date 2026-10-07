import { describe, expect, it } from "vitest";
import { coverRect, formatClock, formatElapsed, isoTime, localeFromTag, rectStyle, share } from "./format.ts";

describe("formatClock", () => {
  it("shows minutes and seconds, and hours from one hour on", () => {
    expect(formatClock((42 * 60 + 17) * 1000)).toBe("42:17");
    expect(formatClock(252_000)).toBe("04:12");
    expect(formatClock(42_999)).toBe("00:42");
    expect(formatClock((62 * 60 + 17) * 1000)).toBe("1:02:17");
  });

  it("never goes below zero", () => {
    expect(formatClock(-5000)).toBe("00:00");
    expect(formatClock(Number.NaN)).toBe("00:00");
  });
});

describe("formatElapsed", () => {
  it("always shows hours", () => {
    expect(formatElapsed((47 * 60 + 36) * 1000)).toBe("00:47:36");
    expect(formatElapsed(16_000)).toBe("00:00:16");
    expect(formatElapsed((25 * 3600 + 1) * 1000)).toBe("25:00:01");
  });
});

describe("share", () => {
  it("clamps to 0..1 and survives a zero total", () => {
    expect(share(7, 20)).toBe(0.35);
    expect(share(30, 20)).toBe(1);
    expect(share(-1, 20)).toBe(0);
    expect(share(5, 0)).toBe(0);
  });
});

describe("localeFromTag", () => {
  it("maps BCP 47 tags back to the student's locale", () => {
    expect(localeFromTag("kk-KZ", "en")).toBe("kk");
    expect(localeFromTag("ru-RU", "en")).toBe("ru");
    expect(localeFromTag("en-GB", "kk")).toBe("en");
    expect(localeFromTag("ru", "en")).toBe("ru");
    expect(localeFromTag("de-DE", "kk")).toBe("kk");
  });
});

describe("coverRect", () => {
  const card = { x: 0.6071, y: 0.5, width: 0.3179, height: 0.2667 };

  it("places a 4:3 camera rectangle in the 520 × 420 preview where Figma draws the card frame", () => {
    const box = coverRect(card, 4 / 3, 520 / 420);
    expect(box.x * 520).toBeCloseTo(320, 0);
    expect(box.y * 420).toBeCloseTo(210, 0);
    expect(box.width * 520).toBeCloseTo(178, 0);
    expect(box.height * 420).toBeCloseTo(112, 0);
  });

  it("flips a mirrored preview", () => {
    const plain = coverRect(card, 4 / 3, 4 / 3);
    const mirrored = coverRect(card, 4 / 3, 4 / 3, true);
    expect(plain).toEqual(card);
    expect(mirrored.x).toBeCloseTo(1 - card.x - card.width, 6);
  });

  it("crops top and bottom for a taller picture", () => {
    const box = coverRect({ x: 0, y: 0.5, width: 1, height: 0.5 }, 1, 2);
    expect(box.width).toBe(1);
    expect(box.y).toBeCloseTo(0.5, 6);
    expect(box.height).toBeCloseTo(1, 6);
  });
});

describe("rectStyle and isoTime", () => {
  it("writes percentages", () => {
    expect(rectStyle({ x: 0.25, y: 0.5, width: 0.123456, height: 1 })).toEqual({
      left: "25%",
      top: "50%",
      width: "12.35%",
      height: "100%",
    });
  });

  it("gives ISO 8601 or undefined", () => {
    expect(isoTime(Date.parse("2026-10-09T10:47:02+05:00"))).toBe("2026-10-09T05:47:02.000Z");
    expect(isoTime(Number.NaN)).toBeUndefined();
  });
});
