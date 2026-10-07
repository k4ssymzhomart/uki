/** Latin digraphs that transliterate one Kazakh letter (Zhansaya, Shynar, Chingiz, Khan, Tsoi). */
const DIGRAPHS = ["zh", "sh", "ch", "kh", "ts"] as const;

function initialOf(word: string): string {
  const lower = word.toLowerCase();
  const digraph = DIGRAPHS.find((d) => lower.startsWith(d));
  if (digraph) return word.slice(0, digraph.length);
  const segment = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    .segment(word)
    [Symbol.iterator]()
    .next();
  return segment.done ? "" : segment.value.segment;
}

/**
 * A person's short name: the first name and the initial of the last name, as Figma writes students on
 * the wall (2.4 "Madina T.", "Dana Zh.") and the proctor on the student screens (2.1d and 2.1e
 * "Aigerim S."). Middle names are dropped; a one-word name stays as it is. Data only: no words added.
 */
export function shortName(fullName: string): string {
  const words = fullName
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  const first = words[0];
  if (first === undefined) return "";
  const last = words.at(-1);
  if (words.length < 2 || last === undefined) return first;
  return `${first} ${initialOf(last)}.`;
}
