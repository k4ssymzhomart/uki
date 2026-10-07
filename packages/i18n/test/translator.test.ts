import { createFormatter } from "use-intl/core";
import { describe, expect, it } from "vitest";
import {
  BCP47,
  createUkiTranslator,
  DEFAULT_LOCALE,
  formatDate,
  formats,
  formatTime,
  isLocale,
  LOCALE_LABELS,
  LOCALES,
  loadMessages,
  localeSchema,
  TIME_ZONE,
} from "../src/index.ts";

describe("locales", () => {
  it("defaults students to Kazakh and orders the switch ҚАЗ, РУС, ENG", () => {
    expect(DEFAULT_LOCALE).toBe("kk");
    expect(LOCALES).toEqual(["kk", "ru", "en"]);
    expect(LOCALES.map((l) => LOCALE_LABELS[l])).toEqual(["ҚАЗ", "РУС", "ENG"]);
    expect(BCP47).toEqual({ kk: "kk-KZ", ru: "ru-RU", en: "en-GB" });
  });

  it("checks a locale at a boundary", () => {
    expect(isLocale("ru")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(localeSchema.safeParse("kz").success).toBe(false);
  });
});

describe("createUkiTranslator", () => {
  it("renders a sample key in kk, ru and en (WP 0.1)", () => {
    const sample = (locale: "kk" | "ru" | "en") =>
      createUkiTranslator(locale)("exam.counter", { n: 7, total: 20 });
    expect(sample("kk")).toBe("Сұрақ 7 / 20");
    expect(sample("ru")).toBe("Вопрос 7 из 20");
    expect(sample("en")).toBe("Question 7 of 20");
  });

  it("renders a renamed key and a namespace", () => {
    expect(createUkiTranslator("kk")("done.flags.label")).toBe("Белгілер");
    expect(
      createUkiTranslator("en")("app.title.default", { course: "Mathematics 2", examType: "Midterm" }),
    ).toBe("Üki · Mathematics 2 · Midterm");
    const exam = createUkiTranslator("ru", "exam");
    expect(exam("phone.title")).toBe("Телефон обнаружен");
  });

  it("prints {confidence, number, ::.00} as 0.94 in en and 0,94 in kk and ru", () => {
    expect(createUkiTranslator("en")("exam.phone.status", { confidence: 0.94 })).toBe(
      "phone in frame · 0.94",
    );
    expect(createUkiTranslator("kk")("exam.phone.status", { confidence: 0.94 })).toBe(
      "кадрда телефон · 0,94",
    );
    expect(createUkiTranslator("ru")("exam.phone.status", { confidence: 0.94 })).toBe(
      "телефон в кадре · 0,94",
    );
    expect(createUkiTranslator("en")("event.phone.detail", { confidence: 0.9 })).toBe(
      "Confidence 0.90 · frame kept as evidence",
    );
  });

  it("picks Russian one, few and many", () => {
    const t = createUkiTranslator("ru");
    expect(t("exam.camera.faces", { count: 1 })).toBe("1 лицо");
    expect(t("exam.camera.faces", { count: 2 })).toBe("2 лица");
    expect(t("exam.camera.faces", { count: 5 })).toBe("5 лиц");
    expect(t("exam.camera.faces", { count: 11 })).toBe("11 лиц");
    expect(t("exam.camera.faces", { count: 21 })).toBe("21 лицо");
    expect(t("exam.camera.faces", { count: 24 })).toBe("24 лица");
    expect(t("event.browser_locked", { count: 3 })).toBe("Браузер заблокирован · закрыто 3 вкладки");
    expect(t("event.browser_locked", { count: 5 })).toBe("Браузер заблокирован · закрыто 5 вкладок");
    expect(t("event.browser_locked", { count: 1 })).toBe("Браузер заблокирован · закрыта 1 вкладка");
  });

  it("keeps the Kazakh noun singular and uses English one and other", () => {
    expect(createUkiTranslator("kk")("exam.camera.faces", { count: 3 })).toBe("3 бет");
    expect(createUkiTranslator("en")("exam.camera.faces", { count: 1 })).toBe("1 face");
    expect(createUkiTranslator("en")("exam.camera.faces", { count: 3 })).toBe("3 faces");
  });

  it("type-checks keys against messages/en.json", () => {
    const t = createUkiTranslator("en");
    const typeOnly = () => {
      // @ts-expect-error: not a message key
      t("exam.no_such_key");
      // @ts-expect-error: a namespace, not a message
      t("exam");
    };
    expect(typeof typeOnly).toBe("function");
  });
});

describe("loadMessages", () => {
  it("returns each locale's catalog messages", () => {
    expect(loadMessages("kk").join.title).toBe("Емтиханға кіріңіз.");
    expect(loadMessages("ru").join.title).toBe("Войдите на экзамен.");
    expect(loadMessages("en").join.title).toBe("Join your exam.");
  });
});

describe("formatTime and formatDate", () => {
  // 10:47:02 on Friday 9 October 2026 in Asia/Almaty (UTC+5).
  const instant = new Date("2026-10-09T05:47:02Z");

  it("shows the time in Asia/Almaty, 24-hour, in every locale", () => {
    expect(formatTime(instant, "en")).toBe("10:47");
    expect(formatTime(instant, "en", { seconds: true })).toBe("10:47:02");
    expect(formatTime(instant, "kk", { seconds: true })).toBe("10:47:02");
    expect(formatTime(instant, "ru")).toBe("10:47");
    expect(formatTime("2026-10-09T19:05:00Z", "en")).toBe("00:05");
    expect(formatTime(instant.getTime(), "kk")).toBe("10:47");
  });

  it("writes the receipt date as the catalog note on done.submitted.value asks", () => {
    expect(formatDate(instant, "en")).toBe("Fri 9 Oct");
    expect(formatDate(instant, "kk")).toBe("жм, 9 қаз");
    expect(formatDate(instant, "ru")).toBe("пт, 9 окт");
    // 20:00 UTC on the 8th is already the 9th in Almaty.
    expect(formatDate("2026-10-08T20:00:00Z", "en")).toBe("Fri 9 Oct");
  });

  it("takes plain Intl options too", () => {
    expect(formatDate(instant, "en", { day: "numeric", month: "long", year: "numeric" })).toBe(
      "9 October 2026",
    );
    expect(formatDate(instant, "ru", { day: "numeric", month: "long" })).toBe("9 октября");
  });

  it("rejects something that is not a date", () => {
    expect(() => formatTime("not a date", "en")).toThrow(RangeError);
  });
});

describe("shared formats for use-intl providers", () => {
  it("format numbers and times by name in Asia/Almaty", () => {
    const instant = new Date("2026-10-09T05:47:02Z");
    const kk = createFormatter({ locale: BCP47.kk, formats, timeZone: TIME_ZONE });
    const en = createFormatter({ locale: BCP47.en, formats, timeZone: TIME_ZONE });
    expect(kk.number(0.94, "confidence")).toBe("0,94");
    expect(en.number(0.94, "confidence")).toBe("0.94");
    expect(kk.dateTime(instant, "timeSeconds")).toBe("10:47:02");
    expect(en.dateTime(instant, "time")).toBe("10:47");
  });
});
