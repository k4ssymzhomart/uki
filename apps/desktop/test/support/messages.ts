// The catalog's built messages, read from disk: Node's ESM loader (which Playwright uses) refuses
// @uki/i18n's JSON imports without an import attribute, so the test does not import that module.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Locale, Messages } from "@uki/i18n";

const MESSAGES_DIR = fileURLToPath(new URL("../../../../packages/i18n/messages/", import.meta.url));

export function messagesFor(locale: Locale): Messages {
  return JSON.parse(readFileSync(`${MESSAGES_DIR}${locale}.json`, "utf8")) as Messages;
}
