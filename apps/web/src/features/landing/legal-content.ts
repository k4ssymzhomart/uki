/**
 * The two legal pages as data: sections in the order of the frames (Privacy policy 196:4125, Terms of
 * use 197:4144), each a run of paragraphs and bullet lists. Text lives in dashboard-landing.json under
 * dashboard.landing.privacyPolicy.* and dashboard.landing.termsOfUse.*; here only the shape.
 */
export type LegalBlock = { kind: "p"; key: string } | { kind: "ul"; keys: readonly string[] };
export type LegalSection = { id: string; blocks: readonly LegalBlock[] };
export type LegalDocument = {
  namespace: "privacyPolicy" | "termsOfUse";
  short: readonly string[];
  sections: readonly LegalSection[];
};

const p = (key: string): LegalBlock => ({ kind: "p", key });
const ul = (...keys: string[]): LegalBlock => ({ kind: "ul", keys });

export const PRIVACY_POLICY: LegalDocument = {
  namespace: "privacyPolicy",
  short: ["short1", "short2", "short3", "short4"],
  sections: [
    { id: "whoWeAre", blocks: [p("p1")] },
    { id: "staysOnLaptop", blocks: [ul("li1", "li2", "li3")] },
    { id: "collect", blocks: [p("p1"), ul("li1", "li2", "li3", "li4", "li5"), p("p2")] },
    { id: "why", blocks: [ul("li1", "li2", "li3", "li4"), p("p1")] },
    { id: "retention", blocks: [ul("li1", "li2", "li3")] },
    { id: "storage", blocks: [p("p1")] },
    { id: "access", blocks: [ul("li1", "li2", "li3", "li4")] },
    { id: "rights", blocks: [p("p1")] },
    { id: "changes", blocks: [p("p1")] },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  namespace: "termsOfUse",
  short: ["short1", "short2", "short3", "short4"],
  sections: [
    { id: "audience", blocks: [p("p1")] },
    { id: "accounts", blocks: [ul("li1", "li2", "li3")] },
    { id: "exam", blocks: [ul("li1", "li2", "li3")] },
    { id: "mustNot", blocks: [ul("li1", "li2", "li3", "li4")] },
    { id: "flags", blocks: [p("p1")] },
    { id: "availability", blocks: [p("p1")] },
    { id: "data", blocks: [p("p1")] },
    { id: "liability", blocks: [p("p1")] },
    { id: "ending", blocks: [p("p1")] },
    { id: "law", blocks: [p("p1")] },
  ],
};

/** "01" … "10": the mono number before each section title. */
export function sectionNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
