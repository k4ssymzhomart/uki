/**
 * `pnpm --filter @uki/i18n kk-intl-data`: writes src/kk-intl/kk-data.json, the Kazakh data the Intl
 * polyfill (src/kk-intl/install.ts) feeds to the FormatJS NumberFormat and DateTimeFormat classes when the
 * runtime's ICU has no Kazakh (Electron and Chromium). It is taken from the installed @formatjs packages:
 *
 * - numberFormat: `@formatjs/intl-numberformat/locale-data/kk.js`, whole.
 * - dateTimeFormat: `@formatjs/intl-datetimeformat/locale-data/kk.js` without what Üki never asks for:
 *   time zone names other than Asia/Almaty and UTC (timeZoneName: "long" falls back to "GMT+5" for any
 *   other zone) and the date interval patterns (formatRange falls back to "{0} - {1}").
 * - timeZones: Asia/Almaty from `@formatjs/intl-datetimeformat/add-all-tz.js`, re-packed alone. UTC
 *   needs no data.
 *
 * `--check` writes nothing and exits 1 when the file is not what the installed packages give.
 * Plural rules are not here: their locale data is code, so install.ts imports the package's own module.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const I18N_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const KK_DATA_FILE = "src/kk-intl/kk-data.json";
/** The one zone with data: every Üki screen shows Asia/Almaty (CLAUDE.md). */
export const DATA_TIME_ZONE = "Asia/Almaty";
/** Time zone names kept in the Kazakh data. */
const NAMED_ZONES = [DATA_TIME_ZONE, "UTC"];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface LocaleData {
  locale: string;
  data: Record<string, Json>;
}
interface PackedZones {
  abbrvs: string;
  offsets: string;
  zones: string[];
}

export interface KazakhIntlData {
  generatedFrom: Record<string, string>;
  numberFormat: LocaleData;
  dateTimeFormat: LocaleData;
  timeZones: PackedZones;
}

/**
 * Runs one of the packages' generated data modules against a stand-in `Intl` and returns what it passes to
 * `__addLocaleData` or `__addTZData`. The modules are plain scripts that only call those two functions.
 */
function capture(specifier: string, constructorName: "NumberFormat" | "DateTimeFormat"): unknown[] {
  const source = readFileSync(require.resolve(specifier), "utf8");
  const captured: unknown[] = [];
  const receiver = {
    __addLocaleData: (...data: unknown[]) => captured.push(...data),
    __addTZData: (data: unknown) => captured.push(data),
  };
  new Function("Intl", "globalThis", source)({ [constructorName]: receiver }, {});
  return captured;
}

function one<T>(items: unknown[], what: string): T {
  if (items.length !== 1) throw new Error(`${what}: expected one data object, got ${items.length}`);
  return items[0] as T;
}

function packageVersion(name: string): string {
  // package.json is not in the packages' exports; it sits next to their main module.
  const file = join(dirname(require.resolve(name)), "package.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
}

/** Keeps one zone of a packed time zone table, with its abbreviations and offsets re-indexed. */
export function packZone(all: PackedZones, zone: string): PackedZones {
  const line = all.zones.find((z) => z.startsWith(`${zone}|`));
  if (!line) throw new Error(`no time zone data for ${zone}`);
  const abbrvs = all.abbrvs.split("|");
  const offsets = all.offsets.split("|");
  const keptAbbrvs: string[] = [];
  const keptOffsets: string[] = [];
  const indexOf = (kept: string[], value: string) => {
    const found = kept.indexOf(value);
    if (found >= 0) return found;
    kept.push(value);
    return kept.length - 1;
  };
  const [name, ...transitions] = line.split("|");
  const repacked = transitions.map((transition) => {
    const [at, abbrv, offset, dst] = transition.split(",");
    const a = abbrvs[Number(abbrv)];
    const o = offsets[Number(offset)];
    if (a === undefined || o === undefined) throw new Error(`${zone}: bad transition ${transition}`);
    return [at, indexOf(keptAbbrvs, a), indexOf(keptOffsets, o), dst].join(",");
  });
  return {
    abbrvs: keptAbbrvs.join("|"),
    offsets: keptOffsets.join("|"),
    zones: [[name, ...repacked].join("|")],
  };
}

export function extractKazakhIntlData(): KazakhIntlData {
  const numberFormat = one<LocaleData>(
    capture("@formatjs/intl-numberformat/locale-data/kk.js", "NumberFormat"),
    "number data",
  );
  const dateTime = one<LocaleData>(
    capture("@formatjs/intl-datetimeformat/locale-data/kk.js", "DateTimeFormat"),
    "date data",
  );
  const zones = one<PackedZones>(
    capture("@formatjs/intl-datetimeformat/add-all-tz.js", "DateTimeFormat"),
    "time zone data",
  );

  const { timeZoneName, intervalFormats, ...rest } = dateTime.data as {
    timeZoneName: Record<string, Json>;
    intervalFormats: Record<string, Json>;
  } & Record<string, Json>;
  const names = Object.fromEntries(
    NAMED_ZONES.flatMap((z) => (timeZoneName[z] ? [[z, timeZoneName[z]]] : [])),
  );
  return {
    generatedFrom: {
      "@formatjs/intl-numberformat": packageVersion("@formatjs/intl-numberformat"),
      "@formatjs/intl-datetimeformat": packageVersion("@formatjs/intl-datetimeformat"),
    },
    numberFormat,
    dateTimeFormat: {
      locale: dateTime.locale,
      data: {
        ...rest,
        timeZoneName: names,
        intervalFormats: { intervalFormatFallback: intervalFormats.intervalFormatFallback ?? "{0} - {1}" },
      },
    },
    timeZones: packZone(zones, DATA_TIME_ZONE),
  };
}

/** The file as Biome formats it, so `pnpm check` passes on it. */
function formatted(data: KazakhIntlData): string {
  const raw = `${JSON.stringify(data, null, 2)}\n`;
  const biome = join(I18N_ROOT, "../../node_modules/.bin/biome");
  if (!existsSync(biome)) return raw;
  const result = spawnSync(biome, ["format", `--stdin-file-path=${join(I18N_ROOT, KK_DATA_FILE)}`], {
    input: raw,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`biome format failed: ${result.stderr}`);
  return result.stdout;
}

function main(): void {
  const check = process.argv.includes("--check");
  const file = join(I18N_ROOT, KK_DATA_FILE);
  const content = formatted(extractKazakhIntlData());
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === content) {
    console.log(`@uki/i18n: ${KK_DATA_FILE} up to date (${content.length} bytes)`);
    return;
  }
  if (check) {
    console.error(`@uki/i18n: ${KK_DATA_FILE} is out of date, run pnpm --filter @uki/i18n kk-intl-data`);
    process.exit(1);
  }
  writeFileSync(file, content);
  console.log(`@uki/i18n: wrote ${KK_DATA_FILE} (${content.length} bytes)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
