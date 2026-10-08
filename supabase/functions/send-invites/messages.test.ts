// The function's small ICU formatter against use-intl (what the apps use) for every email message, in
// every language, with every weekday and month the selects name: the catalog stays the one source.
import { describe, expect, it } from "vitest";
import { createUkiTranslator } from "../../../packages/i18n/src/index.ts";
import { EMAIL_MESSAGES } from "../_shared/contracts/email-messages.ts";
import { EMAIL_LOCALES, type EmailKey, formatEmailMessage, isEmailLocale } from "./messages.ts";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const KEYS = Object.keys(EMAIL_MESSAGES.en) as EmailKey[];

function argsFor(index: number): Record<string, string> {
  return {
    exam: "Mathematics 2 · Midterm",
    code: "MATH2-204-FRI",
    lobby: "09:40",
    time: "10:00",
    day: String((index % 28) + 1),
    month: MONTHS[index % MONTHS.length] ?? "jan",
    weekday: WEEKDAYS[index % WEEKDAYS.length] ?? "mon",
    name: "Madina Tulegenova",
    office: "KRU",
    group: "204",
  };
}

describe("formatEmailMessage", () => {
  it("has every email key in kk, ru and en", () => {
    expect(KEYS.length).toBeGreaterThan(10);
    for (const locale of EMAIL_LOCALES)
      expect(Object.keys(EMAIL_MESSAGES[locale]).sort()).toEqual([...KEYS].sort());
  });

  it.each(EMAIL_LOCALES)("matches use-intl for every %s message, weekday and month", (locale) => {
    const t = createUkiTranslator(locale);
    for (const key of KEYS) {
      for (let i = 0; i < 12; i += 1) {
        const args = argsFor(i);
        expect(formatEmailMessage(locale, key, args), `${locale} ${key} ${i}`).toBe(
          t(key as Parameters<typeof t>[0], args),
        );
      }
    }
  });

  it("names the weekday in each language's form", () => {
    expect(formatEmailMessage("en", "email.invite.title", { weekday: "fri", time: "10:00" })).toBe(
      "Your exam is on Friday at 10:00.",
    );
    expect(formatEmailMessage("ru", "email.invite.title", { weekday: "tue", time: "10:00" })).toBe(
      "Ваш экзамен во вторник в 10:00.",
    );
    expect(formatEmailMessage("kk", "email.invite.step_check", { weekday: "fri" })).toBe(
      "Жүйені жұма күніне дейін тексеріңіз.",
    );
    expect(formatEmailMessage("ru", "email.invite.step_check", { weekday: "fri" })).toBe(
      "Пройдите проверку системы до пятницы.",
    );
  });

  it("takes other for a value no arm names, and throws on a missing argument", () => {
    expect(formatEmailMessage("en", "email.invite.title", { weekday: "x", time: "10:00" })).toBe(
      "Your exam is on Sunday at 10:00.",
    );
    expect(() => formatEmailMessage("en", "email.invite.title", { weekday: "fri" })).toThrow(
      /no value for \{time\}/,
    );
  });

  it("knows the three languages", () => {
    expect(EMAIL_LOCALES.every(isEmailLocale)).toBe(true);
    expect(isEmailLocale("de")).toBe(false);
    expect(isEmailLocale(undefined)).toBe(false);
  });
});
