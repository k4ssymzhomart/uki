import { describe, expect, it } from "vitest";
import { format, PORTAL_MESSAGES, portalLocale } from "./messages.ts";

describe("portal messages", () => {
  it("have the same keys and placeholders in English and Russian", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(PORTAL_MESSAGES.ru).sort()).toEqual(Object.keys(PORTAL_MESSAGES.en).sort());
    for (const key of Object.keys(PORTAL_MESSAGES.en) as (keyof typeof PORTAL_MESSAGES.en)[]) {
      expect(PORTAL_MESSAGES.ru[key].trim()).not.toBe("");
      expect(placeholders(PORTAL_MESSAGES.ru[key])).toEqual(placeholders(PORTAL_MESSAGES.en[key]));
    }
  });

  it("fill placeholders and pick the language", () => {
    expect(format(PORTAL_MESSAGES.en.answered, { count: 3, total: 10 })).toBe("3 of 10 answered");
    expect(format("{missing}")).toBe("{missing}");
    expect(portalLocale("?lang=ru", "en-GB")).toBe("ru");
    expect(portalLocale("", "ru-RU")).toBe("ru");
    expect(portalLocale("", "kk-KZ")).toBe("en");
    expect(portalLocale("?lang=xx", undefined)).toBe("en");
  });
});
