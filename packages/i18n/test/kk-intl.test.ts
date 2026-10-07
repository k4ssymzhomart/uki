import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractKazakhIntlData, KK_DATA_FILE, packZone } from "../scripts/kk-intl-data.ts";
import {
  createKazakhIntl,
  type IntlConstructors,
  installKazakhIntl,
  nativeKazakhSupport,
  polyfillHasTimeZone,
  toDateTimeOptions,
} from "../src/kk-intl/install.ts";

// Node has full ICU, so these tests reach the FormatJS polyfill through createKazakhIntl's routers. The
// install itself, in a runtime without Kazakh, runs in Chromium: test/browser/kk-intl.browser.ts.

/** Friday 9 October 2026, 10:47:02 in Asia/Almaty. */
const AT = Date.UTC(2026, 9, 9, 5, 47, 2);
const ALMATY = "Asia/Almaty";

/** A runtime like Electron's: it takes "kk" but formats with root data (here: Japanese plurals, en-US). */
function rootLikeIntl(): IntlConstructors {
  const swap = (locales: unknown, to: string) =>
    Intl.getCanonicalLocales(locales as string | undefined)[0]?.startsWith("kk") ? to : locales;
  // Like a native constructor: Node's prototype and supportedLocalesOf, which claims kk as Electron does.
  const like = <C extends { prototype: object; supportedLocalesOf: unknown }>(real: C, make: object): C =>
    Object.assign(Object.defineProperty(make, "prototype", { value: real.prototype }), {
      supportedLocalesOf: real.supportedLocalesOf,
    }) as unknown as C;
  // Declarations, not arrows: the routers call these with new.
  function NumberFormat(locales?: unknown, options?: Intl.NumberFormatOptions) {
    return new Intl.NumberFormat(swap(locales, "en-US") as string, options);
  }
  function DateTimeFormat(locales?: unknown, options?: Intl.DateTimeFormatOptions) {
    return new Intl.DateTimeFormat(swap(locales, "en-US") as string, options);
  }
  function PluralRules(locales?: unknown, options?: Intl.PluralRulesOptions) {
    return new Intl.PluralRules(swap(locales, "ja") as string, options);
  }
  return {
    NumberFormat: like(Intl.NumberFormat, NumberFormat),
    DateTimeFormat: like(Intl.DateTimeFormat, DateTimeFormat),
    PluralRules: like(Intl.PluralRules, PluralRules),
  };
}

describe("kk-data.json", () => {
  it("is what the installed @formatjs packages give (pnpm --filter @uki/i18n kk-intl-data)", () => {
    const file = JSON.parse(readFileSync(new URL(`../${KK_DATA_FILE}`, import.meta.url), "utf8"));
    expect(file).toEqual(extractKazakhIntlData());
  });

  it("carries Kazakh only and the one time zone Asia/Almaty", () => {
    const data = extractKazakhIntlData();
    expect(data.numberFormat.locale).toBe("kk");
    expect(data.dateTimeFormat.locale).toBe("kk");
    expect(data.timeZones.zones.map((z) => z.split("|")[0])).toEqual([ALMATY]);
    expect(Object.keys(data.dateTimeFormat.data.timeZoneName as object).sort()).toEqual([ALMATY, "UTC"]);
  });

  it("re-packs a zone with its own abbreviations and offsets", () => {
    const packed = packZone(
      { abbrvs: "LMT|+05|+06", offsets: "a|b|c", zones: ["X/Y|,0,0,0|1,2,2,0", "A/B|,1,1,0"] },
      "A/B",
    );
    expect(packed).toEqual({ abbrvs: "+05", offsets: "b", zones: ["A/B|,0,0,0"] });
    expect(() => packZone({ abbrvs: "", offsets: "", zones: [] }, ALMATY)).toThrow(/no time zone data/);
  });
});

describe("nativeKazakhSupport", () => {
  it("passes in Node, which has full ICU, so installing changes nothing there", () => {
    expect(nativeKazakhSupport()).toEqual({ NumberFormat: true, DateTimeFormat: true, PluralRules: true });
    const before = Intl.NumberFormat;
    expect(installKazakhIntl()).toEqual({
      NumberFormat: "native",
      DateTimeFormat: "native",
      PluralRules: "native",
    });
    expect(Intl.NumberFormat).toBe(before);
  });

  it("fails for a runtime that formats kk with root data, as Electron and Chromium do", () => {
    expect(nativeKazakhSupport(rootLikeIntl())).toEqual({
      NumberFormat: false,
      DateTimeFormat: false,
      PluralRules: false,
    });
  });
});

describe("createKazakhIntl routers", () => {
  const native = rootLikeIntl();
  const k = createKazakhIntl(native);

  it("format Kazakh numbers through the polyfill", () => {
    expect(
      new k.NumberFormat("kk-KZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(0.94),
    ).toBe("0,94");
    expect(new k.NumberFormat("kk", { maximumFractionDigits: 1 }).format(1234.5)).toBe("1 234,5");
    // Called without new, as some libraries do.
    expect(k.NumberFormat("kk-KZ").format(0.5)).toBe("0,5");
    expect(nativeKazakhSupport(k)).toEqual({ NumberFormat: true, DateTimeFormat: true, PluralRules: true });
  });

  it("format Kazakh dates in Asia/Almaty, with parts for the receipt date", () => {
    const dtf = new k.DateTimeFormat("kk-KZ", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: ALMATY,
    });
    expect(dtf.formatToParts(AT).map((p) => [p.type, p.value])).toEqual([
      ["day", "9"],
      ["literal", " "],
      ["month", "қаз."],
      ["literal", ", "],
      ["weekday", "жм"],
    ]);
    expect(
      new k.DateTimeFormat("kk-KZ", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: ALMATY,
      }).format(AT),
    ).toBe("9 қазан, жұма");
    const time = { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" } as const;
    expect(new k.DateTimeFormat("kk-KZ", { ...time, timeZone: ALMATY }).format(AT)).toBe("10:47:02");
    expect(new k.DateTimeFormat("kk-KZ", { ...time, timeZone: "UTC" }).format(AT)).toBe("05:47:02");
    // No zone: the runtime's zone when there is data for it, otherwise Asia/Almaty.
    expect([ALMATY, "UTC"]).toContain(new k.DateTimeFormat("kk-KZ").resolvedOptions().timeZone);
    // formatRange falls back to "{0} - {1}" (kk-data.json drops the interval patterns).
    expect(
      new k.DateTimeFormat("kk-KZ", { day: "numeric", month: "long", timeZone: ALMATY }).formatRange(
        AT,
        AT + 3 * 86_400_000,
      ),
    ).toBe("9 қазан - 12 қазан");
  });

  it("keep a Kazakh date in a zone without data on the native formatter, so the time is right", () => {
    const moscow = new k.DateTimeFormat("kk-KZ", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Moscow",
    });
    expect(Object.getPrototypeOf(moscow)).toBe(Intl.DateTimeFormat.prototype);
    expect(moscow.format(AT)).toBe("08:47");
    expect(polyfillHasTimeZone("asia/almaty")).toBe(true);
    expect(polyfillHasTimeZone("Etc/UTC")).toBe(true);
    expect(polyfillHasTimeZone("Asia/Qostanay")).toBe(false);
  });

  it("select Kazakh plurals through the polyfill", () => {
    const rules = new k.PluralRules("kk-KZ");
    expect([1, 2, 21].map((n) => rules.select(n))).toEqual(["one", "other", "other"]);
    expect(rules.resolvedOptions().pluralCategories).toEqual(["one", "other"]);
  });

  it("leave Russian and English on the native constructors", () => {
    const ru = new k.NumberFormat("ru-RU", { minimumFractionDigits: 2 });
    expect(Object.getPrototypeOf(ru)).toBe(Intl.NumberFormat.prototype);
    expect(ru.resolvedOptions().locale).toBe("ru-RU");
    expect(
      new k.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: ALMATY,
      }).format(AT),
    ).toBe("Fri 9 Oct");
    expect(new k.PluralRules("ru").select(5)).toBe("many");
    expect(k.NumberFormat.supportedLocalesOf(["ru-RU", "en-GB"])).toEqual(["ru-RU", "en-GB"]);
  });

  it("route by the first requested locale, and pass anything invalid to the native constructor", () => {
    expect(new k.NumberFormat(["kk", "ru"], { minimumFractionDigits: 1 }).format(0.5)).toBe("0,5");
    expect(new k.NumberFormat(["en-US", "kk"], { minimumFractionDigits: 1 }).format(0.5)).toBe("0.5");
    expect(() => new k.NumberFormat("not a locale!")).toThrow(RangeError);
  });

  it("accept instances of both kinds with instanceof", () => {
    expect(new k.NumberFormat("kk")).toBeInstanceOf(k.NumberFormat);
    expect(new k.NumberFormat("en")).toBeInstanceOf(k.NumberFormat);
    expect(new k.DateTimeFormat("kk")).toBeInstanceOf(k.DateTimeFormat);
  });
});

describe("toDateTimeOptions", () => {
  it("adds the fields Date.prototype.toLocale*String use when none are given", () => {
    expect(toDateTimeOptions(undefined, "any", "all")).toEqual({
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    expect(toDateTimeOptions({ timeZone: ALMATY }, "date", "date")).toEqual({
      timeZone: ALMATY,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    expect(toDateTimeOptions({ hour: "2-digit" }, "time", "time")).toEqual({ hour: "2-digit" });
    expect(toDateTimeOptions({ dateStyle: "short" }, "any", "all")).toEqual({ dateStyle: "short" });
    expect(() => toDateTimeOptions({ timeStyle: "short" }, "date", "date")).toThrow(TypeError);
  });
});
