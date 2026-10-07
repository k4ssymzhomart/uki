import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  type MessageFormatElement,
  type PluralElement,
  parse,
} from "@formatjs/icu-messageformat-parser";
import { z } from "zod";

/**
 * The i18n build: catalog.json (and dashboard.json, English only) to nested message objects for
 * en, kk and ru, with every check the plan asks for. Pure: the CLI in scripts/build.ts reads and
 * writes the files, tests call buildMessages directly.
 */

export const LANGUAGES = ["en", "kk", "ru"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * The plan's eight messages that depend on a count (Localization, Plurals). English and Russian must
 * carry a plural block; Kazakh keeps the noun singular after a number, so it may omit one.
 * rules.eyes.body is the one exception in English: "{seconds} s" uses the unit symbol, which does
 * not inflect, and its catalog note says "ICU plural (Russian)".
 */
export const COUNT_MESSAGES: Readonly<Record<string, readonly Language[]>> = {
  "check.preview.status": ["en", "ru"],
  "exam.camera.faces": ["en", "ru"],
  "identity.help.body": ["en", "ru"],
  "rules.eyes.body": ["ru"],
  "event.browser_locked": ["en", "ru"],
  "done.flags.value": ["en", "ru"],
  "ended.answered.value": ["en", "ru"],
  "lock.done.body": ["en", "ru"],
};

const SEGMENT = /^[a-z0-9][a-zA-Z0-9_]*$/;
/** CLAUDE.md: no emoji in product copy. */
const EMOJI = /\p{Extended_Pictographic}/u;

export const catalogEntrySchema = z.strictObject({
  key: z.string(),
  group: z.string(),
  source: z.enum(["figma", "added", "added-not-in-figma"]),
  // Optional so that a missing language is reported by name instead of as a schema error.
  en: z.string().optional(),
  kk: z.string().optional(),
  ru: z.string().optional(),
  notes: z.string(),
});

export const catalogSchema = z.strictObject({
  about: z.string(),
  file: z.string(),
  figma_file: z.string(),
  renames: z.record(z.string(), z.string()),
  keys: z.array(catalogEntrySchema),
});

/** dashboard.json: flat `dashboard.*` key to English text, filled from the Figma dashboard frames. */
export const dashboardSchema = z.record(z.string(), z.string());

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export interface NestedMessages {
  [key: string]: string | NestedMessages;
}

export interface BuildResult {
  /** Null when there are problems. */
  readonly messages: Readonly<Record<Language, NestedMessages>> | null;
  readonly problems: readonly string[];
  /** Number of catalog keys and of dashboard keys that went in. */
  readonly counts: { readonly catalog: number; readonly dashboard: number };
}

// ---------------------------------------------------------------------------------------------
// ICU helpers

/** Every argument a message uses, inside plural and select arms too; rich-text tags as `<tag>`. */
export function argumentNames(elements: readonly MessageFormatElement[]): Set<string> {
  const names = new Set<string>();
  const walk = (els: readonly MessageFormatElement[]) => {
    for (const el of els) {
      if (
        isArgumentElement(el) ||
        isNumberElement(el) ||
        isDateElement(el) ||
        isTimeElement(el) ||
        isPluralElement(el) ||
        isSelectElement(el)
      ) {
        names.add(el.value);
      }
      if (isPluralElement(el) || isSelectElement(el)) {
        for (const option of Object.values(el.options)) walk(option.value);
      }
      if (isTagElement(el)) {
        names.add(`<${el.value}>`);
        walk(el.children);
      }
    }
  };
  walk(elements);
  return names;
}

function pluralElements(elements: readonly MessageFormatElement[]) {
  const found: PluralElement[] = [];
  const walk = (els: readonly MessageFormatElement[]) => {
    for (const el of els) {
      if (isPluralElement(el)) found.push(el);
      if (isPluralElement(el) || isSelectElement(el)) {
        for (const option of Object.values(el.options)) walk(option.value);
      }
      if (isTagElement(el)) walk(el.children);
    }
  };
  walk(elements);
  return found;
}

export function hasPlural(elements: readonly MessageFormatElement[]): boolean {
  return pluralElements(elements).length > 0;
}

const categoryCache = new Map<string, readonly string[]>();
function pluralCategories(language: Language, type: "cardinal" | "ordinal"): readonly string[] {
  const id = `${language}:${type}`;
  let categories = categoryCache.get(id);
  if (!categories) {
    categories = new Intl.PluralRules(language, { type }).resolvedOptions().pluralCategories;
    categoryCache.set(id, categories);
  }
  return categories;
}

/** Parses one message; returns its AST or the problems found. */
export function checkMessage(
  text: string | undefined,
  language: Language,
  where: string,
): { ast: MessageFormatElement[] | null; problems: string[] } {
  if (text === undefined) return { ast: null, problems: [`${where} [${language}]: missing`] };
  if (text.trim() === "") return { ast: null, problems: [`${where} [${language}]: empty`] };
  if (EMOJI.test(text))
    return { ast: null, problems: [`${where} [${language}]: no emoji in product copy: ${text}`] };
  let ast: MessageFormatElement[];
  try {
    ast = parse(text, { requiresOtherClause: true, shouldParseSkeletons: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ast: null, problems: [`${where} [${language}]: does not parse as ICU (${reason}): ${text}`] };
  }
  const problems: string[] = [];
  for (const plural of pluralElements(ast)) {
    const allowed = pluralCategories(language, plural.pluralType ?? "cardinal");
    for (const arm of Object.keys(plural.options)) {
      if (!arm.startsWith("=") && !allowed.includes(arm)) {
        problems.push(
          `${where} [${language}]: plural arm "${arm}" of {${plural.value}} is not one of the ${language} categories (${allowed.join(", ")})`,
        );
      }
    }
  }
  return { ast, problems };
}

// ---------------------------------------------------------------------------------------------
// Nesting

function setNested(root: NestedMessages, key: string, value: string): string | null {
  const parts = key.split(".");
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] as string;
    const next = node[part];
    if (typeof next === "string") {
      return `${key}: nested-key collision, ${parts.slice(0, i + 1).join(".")} is already a message`;
    }
    if (next === undefined) node[part] = {};
    node = node[part] as NestedMessages;
  }
  const leaf = parts[parts.length - 1] as string;
  const existing = node[leaf];
  if (typeof existing === "string") return `${key}: duplicate key`;
  if (existing !== undefined) return `${key}: nested-key collision, ${key} already holds other keys`;
  node[leaf] = value;
  return null;
}

/** Same content, keys sorted at every level, so the JSON output is stable. */
export function sortDeep(messages: NestedMessages): NestedMessages {
  const sorted: NestedMessages = {};
  for (const key of Object.keys(messages).sort()) {
    const value = messages[key] as string | NestedMessages;
    sorted[key] = typeof value === "string" ? value : sortDeep(value);
  }
  return sorted;
}

export function serialise(messages: NestedMessages): string {
  return `${JSON.stringify(sortDeep(messages), null, 2)}\n`;
}

function isValidKey(key: string): boolean {
  return key.split(".").every((segment) => SEGMENT.test(segment));
}

function schemaProblems(file: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => `${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

// ---------------------------------------------------------------------------------------------
// Build

export function buildMessages(catalogInput: unknown, dashboardInput: unknown): BuildResult {
  const problems: string[] = [];
  const catalogParsed = catalogSchema.safeParse(catalogInput);
  const dashboardParsed = dashboardSchema.safeParse(dashboardInput);
  if (!catalogParsed.success) problems.push(...schemaProblems("catalog.json", catalogParsed.error));
  if (!dashboardParsed.success) problems.push(...schemaProblems("dashboard.json", dashboardParsed.error));
  if (!catalogParsed.success || !dashboardParsed.success) {
    return { messages: null, problems, counts: { catalog: 0, dashboard: 0 } };
  }
  const catalog = catalogParsed.data;
  const dashboard = dashboardParsed.data;

  const catalogKeys = new Set<string>();
  for (const entry of catalog.keys) {
    if (catalogKeys.has(entry.key)) problems.push(`${entry.key}: duplicate key in catalog.json`);
    catalogKeys.add(entry.key);
  }
  for (const [from, to] of Object.entries(catalog.renames)) {
    if (!catalogKeys.has(from)) problems.push(`renames: ${from} is not a catalog key`);
    if (catalogKeys.has(to)) problems.push(`renames: ${from} -> ${to}, but ${to} is already a catalog key`);
  }
  for (const key of Object.keys(COUNT_MESSAGES)) {
    if (!catalogKeys.has(key)) problems.push(`${key}: count message missing from catalog.json`);
  }

  const out: Record<Language, NestedMessages> = { en: {}, kk: {}, ru: {} };
  for (const entry of catalog.keys) {
    const key = catalog.renames[entry.key] ?? entry.key;
    if (!isValidKey(entry.key) || !isValidKey(key)) {
      problems.push(`${entry.key}: key must be dot-separated segments of [a-z0-9][a-zA-Z0-9_]*`);
      continue;
    }
    if (key.startsWith("dashboard."))
      problems.push(`${entry.key}: dashboard.* keys belong in dashboard.json`);
    const where = key === entry.key ? key : `${entry.key} (${key})`;
    const asts = {} as Record<Language, MessageFormatElement[] | null>;
    for (const language of LANGUAGES) {
      const checked = checkMessage(entry[language], language, where);
      problems.push(...checked.problems);
      asts[language] = checked.ast;
    }
    const enAst = asts.en;
    if (enAst) {
      const expected = argumentNames(enAst);
      for (const language of ["kk", "ru"] as const) {
        const ast = asts[language];
        if (!ast) continue;
        const actual = argumentNames(ast);
        const same = expected.size === actual.size && [...expected].every((name) => actual.has(name));
        if (!same) {
          const list = (s: Set<string>) => `{${[...s].sort().join(", ")}}`;
          problems.push(
            `${where}: arguments differ, en has ${list(expected)} and ${language} has ${list(actual)}`,
          );
        }
      }
    }
    for (const language of COUNT_MESSAGES[entry.key] ?? []) {
      const ast = asts[language];
      if (ast && !hasPlural(ast)) {
        problems.push(`${where} [${language}]: depends on a count but has no {n, plural, ...} block`);
      }
    }
    for (const language of LANGUAGES) {
      const text = entry[language];
      if (text === undefined || text.trim() === "") continue;
      const collision = setNested(out[language], key, text);
      // Report a collision once, from English; the other languages share the same keys.
      if (collision && language === "en") problems.push(collision);
    }
  }

  let dashboardCount = 0;
  for (const [key, text] of Object.entries(dashboard)) {
    dashboardCount += 1;
    if (!key.startsWith("dashboard.") || !isValidKey(key)) {
      problems.push(
        `dashboard.json: ${key}: keys must start with "dashboard." and use [a-z0-9][a-zA-Z0-9_]* segments`,
      );
      continue;
    }
    const checked = checkMessage(text, "en", `dashboard.json: ${key}`);
    problems.push(...checked.problems);
    if (checked.ast) {
      const collision = setNested(out.en, key, text);
      if (collision) problems.push(`dashboard.json: ${collision}`);
    }
  }

  return {
    messages:
      problems.length === 0 ? { en: sortDeep(out.en), kk: sortDeep(out.kk), ru: sortDeep(out.ru) } : null,
    problems,
    counts: { catalog: catalog.keys.length, dashboard: dashboardCount },
  };
}
