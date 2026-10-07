/**
 * Up to two initials for an Avatar: the first letter of the first and the last word of a name,
 * upper-cased for the given locale. "Dias Kenzhebekov" gives "DK", "Әсел Нұрланқызы" gives "ӘН".
 */
export function initials(name: string, locale?: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  const first = words[0];
  if (first === undefined) return "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const letters = [firstGrapheme(first), last === undefined ? "" : firstGrapheme(last)].join("");
  return letters.toLocaleUpperCase(locale);
}

function firstGrapheme(word: string): string {
  const segment = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    .segment(word)
    [Symbol.iterator]()
    .next();
  return segment.done ? "" : segment.value.segment;
}
