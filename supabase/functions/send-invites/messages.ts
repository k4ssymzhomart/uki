// The invite email's strings: the catalog's `email.*` keys in en, kk and ru, copied into the function by
// `pnpm functions:sync` (email-messages.ts), and a formatter for the two ICU forms they use: `{arg}`
// and `{arg, select, key {text} … other {text}}`. messages.test.ts checks it against use-intl for every
// email message in every language, so the catalog stays the one source.
import { EMAIL_MESSAGES } from "../_shared/contracts/email-messages.ts";

export type EmailLocale = keyof typeof EMAIL_MESSAGES;
export type EmailKey = keyof (typeof EMAIL_MESSAGES)["en"];
export type MessageArgs = Readonly<Record<string, string>>;

export const EMAIL_LOCALES = ["kk", "ru", "en"] as const satisfies readonly EmailLocale[];

export function isEmailLocale(value: unknown): value is EmailLocale {
  return typeof value === "string" && (EMAIL_LOCALES as readonly string[]).includes(value);
}

class Cursor {
  index = 0;
  constructor(readonly source: string) {}

  fail(problem: string): never {
    throw new Error(`email message: ${problem} at ${this.index} in "${this.source}"`);
  }

  skipSpaces(): void {
    while (/\s/.test(this.source[this.index] ?? "")) this.index += 1;
  }

  word(): string {
    const match = /^[A-Za-z0-9_]+/.exec(this.source.slice(this.index));
    if (!match) this.fail("expected a name");
    this.index += match[0].length;
    return match[0];
  }

  expect(char: string): void {
    if (this.source[this.index] !== char) this.fail(`expected "${char}"`);
    this.index += 1;
  }
}

/** Text up to the closing brace of the current level (or the end), with every argument filled in. */
function formatText(cursor: Cursor, args: MessageArgs, nested: boolean): string {
  let out = "";
  while (cursor.index < cursor.source.length) {
    const char = cursor.source[cursor.index];
    if (char === "}") {
      if (nested) return out;
      cursor.fail("unexpected }");
    }
    if (char !== "{") {
      out += char;
      cursor.index += 1;
      continue;
    }
    cursor.index += 1;
    cursor.skipSpaces();
    const name = cursor.word();
    cursor.skipSpaces();
    const value = args[name];
    if (cursor.source[cursor.index] === "}") {
      cursor.index += 1;
      if (value === undefined) cursor.fail(`no value for {${name}}`);
      out += value;
      continue;
    }
    cursor.expect(",");
    cursor.skipSpaces();
    if (cursor.word() !== "select") cursor.fail("only select is supported");
    cursor.skipSpaces();
    cursor.expect(",");
    let chosen: string | null = null;
    let other: string | null = null;
    for (;;) {
      cursor.skipSpaces();
      if (cursor.source[cursor.index] === "}") {
        cursor.index += 1;
        break;
      }
      const key = cursor.word();
      cursor.skipSpaces();
      cursor.expect("{");
      const arm = formatText(cursor, args, true);
      cursor.expect("}");
      if (key === value) chosen = arm;
      if (key === "other") other = arm;
    }
    if (other === null) cursor.fail(`select {${name}} has no other`);
    out += chosen ?? other;
  }
  if (nested) cursor.fail("missing }");
  return out;
}

/** The message `key` in `locale` with `args` filled in. Throws on a missing argument. */
export function formatEmailMessage(locale: EmailLocale, key: EmailKey, args: MessageArgs = {}): string {
  const source: string = EMAIL_MESSAGES[locale][key];
  return formatText(new Cursor(source), args, false);
}
