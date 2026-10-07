// Display names on the live wall. Data only: no user-facing words live here.

/** The tile name ("Madina T.", "Dana Zh."): the UI kit's shortName, shared with the student app. */
export { shortName } from "@uki/ui";

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
