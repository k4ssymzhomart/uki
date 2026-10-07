// The Kazakh Intl polyfill in a real Chromium (Playwright's build, whose ICU lacks Kazakh like Electron's).
// It records what Chromium prints before the polyfill and checks what the screens print after it.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";

const PAGE_ENTRY = fileURLToPath(new URL("./page.ts", import.meta.url));
const POLYFILL_ENTRY = fileURLToPath(new URL("../../src/polyfill.ts", import.meta.url));
/**
 * Minified size budget for the polyfill and its Kazakh data: 244 KB in October 2026 (FormatJS code about
 * 165 KB, kk-data.json 75 KB).
 */
const POLYFILL_BUDGET_BYTES = 280_000;

async function bundle(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    minify: true,
    target: "chrome127",
    write: false,
    logLevel: "silent",
  });
  const [file] = result.outputFiles;
  if (!file) throw new Error(`esbuild wrote nothing for ${entry}`);
  return file.text;
}

/** Plain Intl calls, run in the page before and after the polyfill. */
function rawIntl() {
  const at = Date.UTC(2026, 9, 9, 5, 47, 2);
  const timeZone = "Asia/Almaty";
  const kk = "kk-KZ";
  return {
    resolvedLocale: new Intl.NumberFormat(kk).resolvedOptions().locale,
    decimal: new Intl.NumberFormat(kk, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(0.94),
    grouped: new Intl.NumberFormat(kk, { maximumFractionDigits: 1 }).format(1234.5),
    receiptParts: new Intl.DateTimeFormat(kk, { weekday: "short", day: "numeric", month: "short", timeZone })
      .formatToParts(at)
      .map((p) => p.value)
      .join(""),
    longDate: new Intl.DateTimeFormat(kk, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone,
    }).format(at),
    time: new Intl.DateTimeFormat(kk, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(at),
    plural: [1, 2, 21].map((n) => new Intl.PluralRules(kk).select(n)).join(" "),
    numberToLocale: (0.94).toLocaleString(kk),
    dateToLocale: new Date(at).toLocaleDateString(kk, { timeZone }),
    ruDecimal: new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2 }).format(0.94),
    ruDate: new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(at),
    enDate: new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(at),
    ruIsNative: Object.getPrototypeOf(new Intl.NumberFormat("ru-RU")) === Intl.NumberFormat.prototype,
    enIsNative: Object.getPrototypeOf(new Intl.DateTimeFormat("en-GB")) === Intl.DateTimeFormat.prototype,
  };
}

let pageBundle = "";
let polyfillBytes = 0;

test.beforeAll(async () => {
  pageBundle = await bundle(PAGE_ENTRY);
  polyfillBytes = Buffer.byteLength(await bundle(POLYFILL_ENTRY));
});

async function blankPage(page: Page): Promise<void> {
  await page.setContent(
    '<!doctype html><html lang="kk-KZ"><head><meta charset="utf-8"></head><body></body></html>',
  );
}

test("Kazakh numbers, dates and plurals in Chromium", async ({ page, browserName, browser }) => {
  await blankPage(page);
  const before = await page.evaluate(rawIntl);
  await page.addScriptTag({ content: pageBundle });
  const after = await page.evaluate(rawIntl);
  const status = await page.evaluate(() => window.ukiIntl.status);
  const kk = await page.evaluate(() => window.ukiIntl.screens("kk"));
  const ru = await page.evaluate(() => window.ukiIntl.screens("ru"));
  const en = await page.evaluate(() => window.ukiIntl.screens("en"));

  console.log(`${browserName} ${browser.version()}: polyfill ${JSON.stringify(status)}`);
  console.table(
    Object.fromEntries(
      Object.keys(before).map((key) => [
        key,
        { before: before[key as keyof typeof before], after: after[key as keyof typeof after] },
      ]),
    ),
  );
  console.log(`polyfill bundle, minified: ${polyfillBytes} bytes`);

  // This Chromium has no Kazakh: the probes fail and the polyfill takes Kazakh numbers and dates.
  if (before.decimal !== "0,94") expect(status.NumberFormat).toBe("polyfill");
  if (!/\p{Script=Cyrillic}/u.test(before.longDate)) expect(status.DateTimeFormat).toBe("polyfill");

  // Plain Intl after the polyfill.
  expect(after.decimal).toBe("0,94");
  expect(after.grouped).toBe("1 234,5");
  expect(after.longDate).toBe("9 қазан, жұма");
  expect(after.time).toBe("10:47");
  expect(after.plural).toBe("one other other");
  expect(after.numberToLocale).toBe("0,94");
  expect(after.dateToLocale).toBe("09.10.2026");
  // Russian and English stay on Chromium's own Intl.
  expect(after.ruIsNative).toBe(true);
  expect(after.enIsNative).toBe(true);
  expect(after.ruDecimal).toBe(before.ruDecimal);
  expect(after.ruDate).toBe(before.ruDate);
  expect(after.enDate).toBe(before.enDate);

  // What the screens print in Kazakh.
  expect(kk.phoneStatus).toBe("кадрда телефон · 0,94");
  expect(kk.phoneDetail).toBe("Сенімділік 0,90 · кадр сақталды");
  expect(kk.confidence).toBe("0,94");
  // The catalog note on done.submitted.value: "Fri 9 Oct · жм, 9 қаз · пт, 9 окт".
  expect(kk.receiptDate).toBe("жм, 9 қаз");
  expect(kk.submitted).toBe("10:47:02 · жм, 9 қаз");
  expect(kk.longDate).toBe("9 қазан, жұма");
  expect(kk.time).toBe("10:47");
  expect(kk.flagsOne).toBe("1 · оны адам қарап шығады");
  expect(kk.flagsMany).toBe("3 · оларды адам қарап шығады");
  expect(kk.storage).toBe("12,3 ГБ бос.");
  expect(kk.network).toBe("Емтихан сервері 1 234 мс ішінде жауап береді.");

  expect(ru.phoneStatus).toBe("телефон в кадре · 0,94");
  expect(ru.receiptDate).toBe("пт, 9 окт");
  expect(ru.flagsMany).toBe("3 · их проверит человек");
  expect(en.phoneStatus).toBe("phone in frame · 0.94");
  expect(en.receiptDate).toBe("Fri 9 Oct");
  expect(en.submitted).toBe("10:47:02 · Fri 9 Oct");

  expect(polyfillBytes).toBeLessThan(POLYFILL_BUDGET_BYTES);
});
