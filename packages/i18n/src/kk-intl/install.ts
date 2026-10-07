// Kazakh for runtimes whose ICU has none. Electron 44 (Chrome 152) and Chromium ship ICU data without
// Kazakh: they accept "kk-KZ" but format with root data, so 0.94 stays "0.94" and 9 October prints as
// "M10 9, Fri". When the runtime fails the Kazakh probes below, Intl.NumberFormat, Intl.DateTimeFormat
// (and Intl.PluralRules, if its probe fails too) become routers: Kazakh goes to the FormatJS polyfill with
// the data in kk-data.json, every other language stays on the runtime's own implementation. Russian and
// English are native everywhere, so only Kazakh data is bundled. Node (full ICU) passes the probes, so
// unit tests run on native Intl.
//
// Not polyfilled: Intl.getCanonicalLocales and Intl.Locale (data-free, native in Electron 44 and Chrome
// 127+, the Lock's minimum), and Intl.RelativeTimeFormat, ListFormat and DisplayNames (no message uses them).
import { DateTimeFormat as PolyfillDateTimeFormat } from "@formatjs/intl-datetimeformat";
import { NumberFormat as PolyfillNumberFormat } from "@formatjs/intl-numberformat";
import { PluralRules as PolyfillPluralRules } from "@formatjs/intl-pluralrules";
// Plural data is code (a rule function), so it comes from the package's own module. With a native
// Intl.PluralRules it queues itself on globalThis.__FORMATJS_PLURALRULES_DATA__, taken below.
import "@formatjs/intl-pluralrules/locale-data/kk.js";
import { TIME_ZONE } from "../time-zone.ts";
import kkData from "./kk-data.json";

const KAZAKH = "kk";
/** Friday 9 October 2026, 05:47:02 UTC (10:47:02 in Asia/Almaty). */
const PROBE = Date.UTC(2026, 9, 9, 5, 47, 2);
const CYRILLIC = /\p{Script=Cyrillic}/u;

type PluralLocaleData = Parameters<typeof PolyfillPluralRules.__addLocaleData>[0];
const PLURAL_QUEUE = "__FORMATJS_PLURALRULES_DATA__";
const pluralQueue = (globalThis as Record<string, unknown>)[PLURAL_QUEUE];
const pluralData: readonly PluralLocaleData[] = Array.isArray(pluralQueue) ? [...pluralQueue] : [];
delete (globalThis as Record<string, unknown>)[PLURAL_QUEUE];

/** The three Intl constructors this module routes. */
export interface IntlConstructors {
  NumberFormat: typeof Intl.NumberFormat;
  DateTimeFormat: typeof Intl.DateTimeFormat;
  PluralRules: typeof Intl.PluralRules;
}

export type KazakhIntlSupport = Readonly<Record<keyof IntlConstructors, boolean>>;
/** Per constructor: "native" when the runtime formats Kazakh itself, "polyfill" when Kazakh is routed. */
export type KazakhIntlStatus = Readonly<Record<keyof IntlConstructors, "native" | "polyfill">>;

function attempt(probe: () => boolean): boolean {
  try {
    return probe();
  } catch {
    return false;
  }
}

/**
 * Whether the runtime formats Kazakh: a decimal comma, a Kazakh month name and the Kazakh plural "one".
 * Electron resolves "kk-KZ" to "kk" and claims support, so the probes check output, not resolvedOptions.
 */
export function nativeKazakhSupport(intl: IntlConstructors = Intl): KazakhIntlSupport {
  return {
    NumberFormat: attempt(
      () => new intl.NumberFormat("kk-KZ", { minimumFractionDigits: 2 }).format(0.94) === "0,94",
    ),
    DateTimeFormat: attempt(() =>
      CYRILLIC.test(new intl.DateTimeFormat("kk-KZ", { month: "long", timeZone: "UTC" }).format(PROBE)),
    ),
    PluralRules: attempt(() => {
      const rules = new intl.PluralRules("kk-KZ");
      return rules.select(1) === "one" && rules.select(2) === "other";
    }),
  };
}

let dataLoaded = false;
/** Hands the Kazakh data to the FormatJS classes, once. */
function loadPolyfillData(): void {
  if (dataLoaded) return;
  dataLoaded = true;
  PolyfillNumberFormat.__addLocaleData(
    kkData.numberFormat as unknown as Parameters<typeof PolyfillNumberFormat.__addLocaleData>[0],
  );
  PolyfillDateTimeFormat.__addLocaleData(
    kkData.dateTimeFormat as unknown as Parameters<typeof PolyfillDateTimeFormat.__addLocaleData>[0],
  );
  PolyfillDateTimeFormat.__addTZData(kkData.timeZones);
  if (pluralData.length > 0) PolyfillPluralRules.__addLocaleData(...pluralData);
}

/** UTC and its aliases need no zone data; Asia/Almaty is the one zone kk-data.json carries. */
const ZONES_WITH_DATA = new Set([TIME_ZONE, "UTC", "Etc/UTC", "GMT", "Etc/GMT"].map((z) => z.toUpperCase()));

export function polyfillHasTimeZone(timeZone: string): boolean {
  return ZONES_WITH_DATA.has(String(timeZone).toUpperCase());
}

type Call = { locales: unknown; options: unknown };
/** How a router builds a formatter: the polyfill with these arguments, or null for the native one. */
type Route = (locales: unknown, options: unknown) => Call | null;

/**
 * The polyfill's arguments when a request resolves to Kazakh: its first locale is kk, or there is none and
 * the runtime's default is kk. Anything Intl.getCanonicalLocales rejects stays native, which throws.
 */
function kazakhCall(locales: unknown, options: unknown, defaultLocale: () => string): Call | null {
  let requested: string[];
  try {
    requested = Intl.getCanonicalLocales(locales as string | string[] | undefined);
  } catch {
    return null;
  }
  const first = requested[0] ?? defaultLocale();
  if (new Intl.Locale(first).language !== KAZAKH) return null;
  return { locales: requested.length > 0 ? locales : first, options };
}

function lazy<T>(make: () => T): () => T {
  let value: { v: T } | undefined;
  return () => {
    value ??= { v: make() };
    return value.v;
  };
}

type AnyConstructor = new (locales?: unknown, options?: unknown) => object;

/**
 * A constructor that builds `polyfill` instances when `route` says so and `native` ones otherwise. It
 * keeps the native prototype and supportedLocalesOf, works with and without `new`, and `instanceof`
 * accepts both kinds of instance.
 */
function router<C>(native: C, polyfill: unknown, route: Route): C {
  const Native = native as unknown as AnyConstructor & { name: string };
  const Polyfill = polyfill as AnyConstructor;
  function Router(locales?: unknown, options?: unknown): object {
    const call = route(locales, options);
    return call ? new Polyfill(call.locales, call.options) : new Native(locales, options);
  }
  Object.defineProperty(Router, "prototype", { value: Native.prototype });
  Object.defineProperty(Router, "name", { value: Native.name });
  Object.defineProperty(Router, "length", { value: 0 });
  Object.defineProperty(Router, "supportedLocalesOf", {
    value: (native as unknown as { supportedLocalesOf: (...args: unknown[]) => string[] }).supportedLocalesOf,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(Router, Symbol.hasInstance, {
    value: (value: unknown) => value instanceof Native || value instanceof Polyfill,
  });
  return Router as unknown as C;
}

/**
 * Routers for the given native constructors (pure: nothing global changes). Kazakh goes to the FormatJS
 * polyfill; a Kazakh DateTimeFormat in a zone without data (anything but Asia/Almaty and UTC) stays
 * native, so the time is right even if the names are not; without a zone it takes the runtime's zone
 * when there is data for it, otherwise Asia/Almaty, the zone every Üki screen shows.
 */
export function createKazakhIntl(native: IntlConstructors = Intl): IntlConstructors {
  loadPolyfillData();
  const defaultLocale = lazy(() => new native.NumberFormat().resolvedOptions().locale);
  const defaultZone = lazy(() => {
    const zone = new native.DateTimeFormat().resolvedOptions().timeZone;
    return zone && polyfillHasTimeZone(zone) ? zone : TIME_ZONE;
  });
  return {
    NumberFormat: router(native.NumberFormat, PolyfillNumberFormat, (locales, options) =>
      kazakhCall(locales, options, defaultLocale),
    ),
    PluralRules: router(native.PluralRules, PolyfillPluralRules, (locales, options) =>
      kazakhCall(locales, options, defaultLocale),
    ),
    DateTimeFormat: router(native.DateTimeFormat, PolyfillDateTimeFormat, (locales, options) => {
      const call = kazakhCall(locales, options, defaultLocale);
      if (!call) return null;
      const opts = (options ?? {}) as Intl.DateTimeFormatOptions;
      if (opts.timeZone === undefined) return { ...call, options: { ...opts, timeZone: defaultZone() } };
      return polyfillHasTimeZone(opts.timeZone) ? call : null;
    }),
  };
}

type Required = "date" | "time" | "any";
type Defaults = "date" | "time" | "all";
const DATE_FIELDS = ["weekday", "year", "month", "day"] as const;
const TIME_FIELDS = ["dayPeriod", "hour", "minute", "second", "fractionalSecondDigits"] as const;

/** ECMA-402 ToDateTimeOptions: the fields Date.prototype.toLocale*String add when none are given. */
export function toDateTimeOptions(
  options: Intl.DateTimeFormatOptions | undefined,
  required: Required,
  defaults: Defaults,
): Intl.DateTimeFormatOptions {
  const opts: Intl.DateTimeFormatOptions = { ...options };
  const has = (fields: readonly (keyof Intl.DateTimeFormatOptions)[]) =>
    fields.some((field) => opts[field] !== undefined);
  let needDefaults = true;
  if ((required === "date" || required === "any") && has(DATE_FIELDS)) needDefaults = false;
  if ((required === "time" || required === "any") && has(TIME_FIELDS)) needDefaults = false;
  if (opts.dateStyle !== undefined || opts.timeStyle !== undefined) needDefaults = false;
  if (required === "date" && opts.timeStyle !== undefined) throw new TypeError("invalid timeStyle");
  if (required === "time" && opts.dateStyle !== undefined) throw new TypeError("invalid dateStyle");
  if (needDefaults && (defaults === "date" || defaults === "all")) {
    Object.assign(opts, { year: "numeric", month: "numeric", day: "numeric" });
  }
  if (needDefaults && (defaults === "time" || defaults === "all")) {
    Object.assign(opts, { hour: "numeric", minute: "numeric", second: "numeric" });
  }
  return opts;
}

type LocaleMethod = (this: unknown, locales?: unknown, options?: unknown) => string;

/** Replaces a toLocale*String method so Kazakh goes through `kazakh` and everything else stays native. */
function patchMethod(
  proto: object,
  name: string,
  isKazakh: (locales: unknown) => boolean,
  kazakh: (self: unknown, locales: unknown, options: unknown) => string,
): void {
  const original = (proto as Record<string, LocaleMethod>)[name];
  if (typeof original !== "function") return;
  Object.defineProperty(proto, name, {
    value: function toLocale(this: unknown, locales?: unknown, options?: unknown): string {
      return isKazakh(locales) ? kazakh(this, locales, options) : original.call(this, locales, options);
    },
    writable: true,
    configurable: true,
  });
}

const INSTALLED = Symbol.for("uki.kk-intl");

/**
 * Installs the routers on globalThis.Intl for each constructor whose Kazakh probe fails, and the matching
 * Number and Date toLocale*String methods. Idempotent; returns what is native and what is routed.
 */
export function installKazakhIntl(): KazakhIntlStatus {
  const global = globalThis as typeof globalThis & { [INSTALLED]?: KazakhIntlStatus };
  const done = global[INSTALLED];
  if (done) return done;
  const support = nativeKazakhSupport(Intl);
  const status: KazakhIntlStatus = {
    NumberFormat: support.NumberFormat ? "native" : "polyfill",
    DateTimeFormat: support.DateTimeFormat ? "native" : "polyfill",
    PluralRules: support.PluralRules ? "native" : "polyfill",
  };
  if (Object.values(status).includes("polyfill")) {
    const native: IntlConstructors = {
      NumberFormat: Intl.NumberFormat,
      DateTimeFormat: Intl.DateTimeFormat,
      PluralRules: Intl.PluralRules,
    };
    const routed = createKazakhIntl(native);
    const defaultLocale = lazy(() => new native.NumberFormat().resolvedOptions().locale);
    const isKazakh = (locales: unknown) => kazakhCall(locales, undefined, defaultLocale) !== null;
    for (const name of ["NumberFormat", "DateTimeFormat", "PluralRules"] as const) {
      if (status[name] === "native") continue;
      Object.defineProperty(Intl, name, { value: routed[name], writable: true, configurable: true });
    }
    if (status.NumberFormat === "polyfill") {
      patchMethod(Number.prototype, "toLocaleString", isKazakh, (self, locales, options) =>
        new routed.NumberFormat(locales as string, options as Intl.NumberFormatOptions).format(Number(self)),
      );
    }
    if (status.DateTimeFormat === "polyfill") {
      const methods: readonly [string, Required, Defaults][] = [
        ["toLocaleString", "any", "all"],
        ["toLocaleDateString", "date", "date"],
        ["toLocaleTimeString", "time", "time"],
      ];
      for (const [name, required, defaults] of methods) {
        patchMethod(Date.prototype, name, isKazakh, (self, locales, options) => {
          const time = (self as Date).getTime();
          if (Number.isNaN(time)) return "Invalid Date";
          const opts = toDateTimeOptions(options as Intl.DateTimeFormatOptions, required, defaults);
          return new routed.DateTimeFormat(locales as string, opts).format(time);
        });
      }
    }
  }
  Object.defineProperty(global, INSTALLED, { value: status });
  return status;
}
