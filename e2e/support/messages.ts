// The dashboard's strings from the generated messages (pnpm i18n:build), English unless a test asks for
// Russian, so selectors follow the catalog instead of repeating copy. Only plain messages are read; ICU
// templates are cut at their first argument with `prefix`.
import { readFileSync } from "node:fs";
import { ROOT } from "./env.ts";

type Tree = { [key: string]: string | Tree };
export type DashboardLocale = "en" | "ru";

const messages = new Map<DashboardLocale, Tree>();

function load(locale: DashboardLocale): Tree {
  let tree = messages.get(locale);
  if (!tree) {
    tree = JSON.parse(readFileSync(`${ROOT}packages/i18n/messages/${locale}.json`, "utf8")) as Tree;
    messages.set(locale, tree);
  }
  return tree;
}

/** The message at a dotted key, for example `dashboard.signIn.submit`. */
export function message(key: string, locale: DashboardLocale = "en"): string {
  let node: string | Tree | undefined = load(locale);
  for (const part of key.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  if (typeof node !== "string")
    throw new Error(`e2e: no message ${key} in packages/i18n/messages/${locale}.json`);
  return node;
}

/**
 * A message filled with simple `{name}` values and cut before the first argument that is still open
 * (plural, select or number formats), for substring matches.
 */
export function prefix(key: string, values: Record<string, string | number> = {}): string {
  const filled = message(key).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
  const open = filled.indexOf("{");
  return open === -1 ? filled : filled.slice(0, open);
}
