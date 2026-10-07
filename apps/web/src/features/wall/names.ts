// Display names on the live wall. Data only: no user-facing words live here.

/** Latin and Cyrillic digraphs that transliterate one Kazakh letter (Zhansaya, Shynar, Chingiz, Khan, Tsoi). */
const DIGRAPHS = ["zh", "sh", "ch", "kh", "ts"] as const;

function initialOf(word: string): string {
  const lower = word.toLowerCase();
  const digraph = DIGRAPHS.find((d) => lower.startsWith(d));
  if (digraph) return word.slice(0, digraph.length);
  return [...word][0] ?? "";
}

/**
 * The wall's tile name: first name and the initial of the last name, as Figma 2.4 draws them
 * ("Madina T.", "Dana Zh."). A one-word name stays as it is.
 */
export function shortName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return "";
  const last = words.at(-1);
  if (words.length < 2 || last === undefined) return first;
  return `${first} ${initialOf(last)}.`;
}

export type Pronoun = "he" | "she" | "other";

const FEMALE_ENDINGS = ["ova", "eva", "ina", "kyzy", "қызы", "ова", "ева", "ина"];
const MALE_ENDINGS = ["ov", "ev", "in", "uly", "ұлы", "ов", "ев", "ин"];

/**
 * The pronoun 2.4e and 2.5 use ("Keep him writing", "sent in her language"). The roster holds no
 * gender, so it is read from a Kazakh or Russian surname ending (Tulegenova, Bekzhanov, Seitkyzy);
 * any other surname gets the neutral "other" wording.
 */
export function pronounFromName(fullName: string): Pronoun {
  const last = fullName.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
  if (last.length < 3) return "other";
  if (FEMALE_ENDINGS.some((ending) => last.endsWith(ending))) return "she";
  if (MALE_ENDINGS.some((ending) => last.endsWith(ending))) return "he";
  return "other";
}
