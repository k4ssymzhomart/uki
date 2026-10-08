import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DASHBOARD_COMMENT_KEY, dashboardFiles, mergeDashboard } from "../build.ts";
import { buildMessages, catalogSchema, dashboardEntrySchema } from "./catalog.ts";
import { CsvError, parseCsv, toCsv } from "./csv.ts";
import type { XlsxSheet } from "./xlsx.ts";

/**
 * The strings review sheet (`pnpm i18n:export`, `pnpm i18n:import`): every message of catalog.json and
 * of the dashboard*.json files as one row, for a read-through in Excel, Numbers or Google Sheets, and
 * the way back for edited Russian and Kazakh cells. Pure apart from reading the source files.
 */

/** Where a string shows, in the order the sheet lists them. */
export const WHERE = ["student app", "Üki Lock", "email", "dashboard", "landing"] as const;
export type Where = (typeof WHERE)[number];

export interface ReviewRow {
  readonly key: string;
  readonly where: Where;
  readonly en: string;
  readonly ru: string;
  /** Empty for the dashboard and the landing site, which have no Kazakh. */
  readonly kk: string;
  /** The catalog's source: figma, added or added-not-in-figma. The dashboard files keep none per key. */
  readonly source: string;
  readonly notes: string;
  /** The file the message lives in, relative to packages/i18n. */
  readonly file: string;
}

export const FULL_HEADER = ["key", "where", "en", "ru", "kk", "source", "notes"] as const;
export const KAZAKH_HEADER = ["key", "where", "en", "kk", "ru", "notes"] as const;

export const CATALOG_FILE = "catalog.json";
export const LANDING_FILE = "dashboard-landing.json";

/** A catalog key's surface: the invite email, Üki Lock (its own keys and the OS names it prints), or the app. */
export function catalogWhere(key: string): Where {
  if (key.startsWith("email.")) return "email";
  if (key.startsWith("lock.") || key.startsWith("os.")) return "Üki Lock";
  return "student app";
}

export function dashboardWhere(file: string): Where {
  return file === LANDING_FILE ? "landing" : "dashboard";
}

export interface SourceFiles {
  /** catalog.json, parsed. */
  readonly catalog: unknown;
  /** Each dashboard*.json, parsed, in dashboardFiles() order. */
  readonly dashboard: readonly { readonly file: string; readonly data: unknown }[];
}

export function readSources(root: string): SourceFiles {
  const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;
  return {
    catalog: read(CATALOG_FILE),
    dashboard: dashboardFiles(root).map((file) => ({ file, data: read(file) })),
  };
}

const dashboardFileSchema = z.record(z.string(), z.unknown());

function compareRows(a: ReviewRow, b: ReviewRow): number {
  const byWhere = WHERE.indexOf(a.where) - WHERE.indexOf(b.where);
  if (byWhere !== 0) return byWhere;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** One row per message, sorted by where (in WHERE's order), then key. Throws on a malformed file. */
export function reviewRows(sources: SourceFiles): ReviewRow[] {
  const catalog = catalogSchema.parse(sources.catalog);
  const rows: ReviewRow[] = [];
  for (const entry of catalog.keys) {
    const renamed = catalog.renames[entry.key];
    const rename = renamed && !entry.notes.includes(renamed) ? ` The apps use it as ${renamed}.` : "";
    rows.push({
      key: entry.key,
      where: catalogWhere(entry.key),
      en: entry.en ?? "",
      ru: entry.ru ?? "",
      kk: entry.kk ?? "",
      source: entry.source,
      notes: `${entry.group}${entry.notes ? `: ${entry.notes}` : ""}${rename}`,
      file: CATALOG_FILE,
    });
  }
  for (const { file, data } of sources.dashboard) {
    for (const [key, value] of Object.entries(dashboardFileSchema.parse(data))) {
      if (key === DASHBOARD_COMMENT_KEY) continue;
      const entry = dashboardEntrySchema.parse(value);
      rows.push({
        key,
        where: dashboardWhere(file),
        en: entry.en ?? "",
        ru: entry.ru ?? "",
        kk: "",
        source: "",
        notes: file,
        file,
      });
    }
  }
  return rows.sort(compareRows);
}

export function fullRow(row: ReviewRow): string[] {
  return [row.key, row.where, row.en, row.ru, row.kk, row.source, row.notes];
}

export function kazakhRow(row: ReviewRow): string[] {
  return [row.key, row.where, row.en, row.kk, row.ru, row.notes];
}

export interface ReviewExport {
  readonly rows: readonly ReviewRow[];
  /** strings-review.csv: every message. */
  readonly full: string;
  /** strings-review-kk.csv: the messages that have Kazakh. */
  readonly kazakh: string;
  /** The two sheets of strings-review.xlsx. */
  readonly sheets: readonly XlsxSheet[];
}

export function exportReview(sources: SourceFiles): ReviewExport {
  const rows = reviewRows(sources);
  const withKazakh = rows.filter((row) => row.kk.trim() !== "");
  return {
    rows,
    full: toCsv([[...FULL_HEADER], ...rows.map(fullRow)]),
    kazakh: toCsv([[...KAZAKH_HEADER], ...withKazakh.map(kazakhRow)]),
    sheets: [
      {
        name: "Russian review",
        header: FULL_HEADER,
        rows: rows.map(fullRow),
        widths: [34, 12, 48, 48, 48, 18, 48],
      },
      {
        name: "Kazakh review",
        header: KAZAKH_HEADER,
        rows: withKazakh.map(kazakhRow),
        widths: [34, 12, 48, 48, 48, 48],
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Import

export type ReviewLanguage = "ru" | "kk";

export interface ReviewChange {
  readonly key: string;
  readonly language: ReviewLanguage;
  readonly file: string;
  readonly from: string;
  readonly to: string;
}

export interface ReviewImport {
  /** Anything here refuses the whole sheet: nothing is written. */
  readonly problems: readonly string[];
  /** Reported, not refused: an English cell that differs from the files, keys the sheet leaves out. */
  readonly notices: readonly string[];
  readonly changes: readonly ReviewChange[];
  /** The source files the changes touch, by path relative to packages/i18n, with their new content. */
  readonly files: Readonly<Record<string, string>>;
}

/** The same JSON layout as the files in the repository (two-space indent, final newline). */
export function serialiseSource(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function sameText(a: string, b: string): boolean {
  return a === b || a.normalize("NFC") === b.normalize("NFC");
}

/**
 * Applies the Russian and Kazakh cells of an edited review sheet (either export, or any CSV with a
 * `key` column and a `ru` or `kk` column) to the source files. Refuses the sheet, changing nothing,
 * when a key is unknown or repeated, a row is short, a dashboard row has Kazakh, or the edited
 * strings fail any check of the i18n build (placeholders, plurals, ICU syntax, empty messages).
 */
export function importReview(csv: string, sources: SourceFiles): ReviewImport {
  const refuse = (problems: string[]): ReviewImport => ({ problems, notices: [], changes: [], files: {} });
  let table: string[][];
  try {
    table = parseCsv(csv);
  } catch (error) {
    return refuse([`not a CSV file: ${error instanceof CsvError ? error.message : String(error)}`]);
  }
  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const column = (name: string) => header.indexOf(name);
  const problems: string[] = [];
  for (const name of new Set(header)) {
    if (name !== "" && header.filter((h) => h === name).length > 1)
      problems.push(`the header has two "${name}" columns`);
  }
  const keyColumn = column("key");
  const languages = (["ru", "kk"] as const).filter((language) => column(language) >= 0);
  if (keyColumn < 0) problems.push('the header has no "key" column');
  if (languages.length === 0) problems.push('the header has neither a "ru" nor a "kk" column');
  if (problems.length > 0) return refuse(problems);

  const catalogRaw = structuredClone(sources.catalog) as { keys: Record<string, unknown>[] };
  const catalog = catalogSchema.parse(catalogRaw);
  const catalogIndex = new Map(catalog.keys.map((entry, i) => [entry.key, i]));
  const dashboardRaw = sources.dashboard.map(({ file, data }) => ({
    file,
    data: structuredClone(dashboardFileSchema.parse(data)) as Record<string, Record<string, unknown>>,
  }));
  const dashboardIndex = new Map<string, { file: string; entry: Record<string, unknown> }>();
  for (const { file, data } of dashboardRaw) {
    for (const [key, value] of Object.entries(data)) {
      if (key === DASHBOARD_COMMENT_KEY) continue;
      dashboardEntrySchema.parse(value);
      dashboardIndex.set(key, { file, entry: value });
    }
  }

  const changes: ReviewChange[] = [];
  const notices: string[] = [];
  const englishDiffers: string[] = [];
  const seen = new Set<string>();
  const enColumn = column("en");
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r] as string[];
    if (cells.every((cell) => cell.trim() === "")) continue;
    const line = `row ${r + 1}`;
    if (cells.length < header.length) {
      problems.push(`${line}: ${cells.length} cells, the header has ${header.length}`);
      continue;
    }
    const key = (cells[keyColumn] ?? "").trim();
    if (key === "") {
      problems.push(`${line}: no key`);
      continue;
    }
    if (seen.has(key)) {
      problems.push(`${line}: ${key} appears twice`);
      continue;
    }
    seen.add(key);
    const catalogAt = catalogIndex.get(key);
    const dashboardAt = dashboardIndex.get(key);
    if (catalogAt === undefined && dashboardAt === undefined) {
      problems.push(`${line}: ${key} is not a key of catalog.json or of any dashboard*.json`);
      continue;
    }
    const target = catalogAt !== undefined ? (catalogRaw.keys[catalogAt] as Record<string, unknown>) : null;
    const entry = target ?? (dashboardAt?.entry as Record<string, unknown>);
    const file = target ? CATALOG_FILE : (dashboardAt?.file as string);
    if (enColumn >= 0 && !sameText(cells[enColumn] ?? "", String(entry.en ?? ""))) englishDiffers.push(key);
    for (const language of languages) {
      const cell = (cells[column(language)] ?? "").replaceAll("\r\n", "\n");
      if (!target && language === "kk") {
        if (cell.trim() !== "") problems.push(`${line}: ${key} is a ${file} string, which has no Kazakh`);
        continue;
      }
      const current = String(entry[language] ?? "");
      if (sameText(cell, current)) continue;
      changes.push({ key, language, file, from: current, to: cell });
      entry[language] = cell;
    }
  }
  if (problems.length > 0) return refuse(problems);

  // The same checks as pnpm i18n:build, on the edited strings.
  const merged = mergeDashboard(dashboardRaw);
  const built = buildMessages(catalogRaw, merged.merged, merged.sources);
  const buildProblems = [...merged.problems, ...built.problems];
  if (buildProblems.length > 0) {
    return refuse(buildProblems.map((p) => `the edited strings fail the i18n build: ${p}`));
  }

  if (englishDiffers.length > 0) {
    notices.push(
      `English is not imported; ${englishDiffers.length} English ${englishDiffers.length === 1 ? "cell differs" : "cells differ"} from the files and stay${englishDiffers.length === 1 ? "s" : ""} as the files have ${englishDiffers.length === 1 ? "it" : "them"}: ${englishDiffers.join(", ")}`,
    );
  }
  const left = [...catalogIndex.keys(), ...dashboardIndex.keys()].filter((key) => !seen.has(key));
  if (left.length > 0 && seen.size > 0) {
    notices.push(
      `${left.length} key${left.length === 1 ? " is" : "s are"} not in the sheet and stay as they are`,
    );
  }

  const touched = new Set(changes.map((change) => change.file));
  const files: Record<string, string> = {};
  if (touched.has(CATALOG_FILE)) files[CATALOG_FILE] = serialiseSource(catalogRaw);
  for (const { file, data } of dashboardRaw) {
    if (touched.has(file)) files[file] = serialiseSource(data);
  }
  return { problems: [], notices, changes, files };
}
