import en from "@uki/i18n/messages/en.json";
import ru from "@uki/i18n/messages/ru.json";
import { describe, expect, it } from "vitest";
import { type LegalDocument, PRIVACY_POLICY, sectionNumber, TERMS_OF_USE } from "./legal-content.ts";

type Tree = { [key: string]: string | Tree };

function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  return typeof node === "string" ? node : undefined;
}

function keys(doc: LegalDocument): string[] {
  const base = `dashboard.landing.${doc.namespace}`;
  return [
    `${base}.title`,
    ...doc.short.map((point) => `${base}.${point}`),
    ...doc.sections.flatMap((section) => [
      `${base}.${section.id}.title`,
      ...section.blocks.flatMap((block) =>
        (block.kind === "p" ? [block.key] : block.keys).map((key) => `${base}.${section.id}.${key}`),
      ),
    ]),
  ];
}

describe("the legal pages' text", () => {
  it.each([PRIVACY_POLICY, TERMS_OF_USE])("has every key of $namespace in English and Russian", (doc) => {
    for (const key of keys(doc)) {
      expect(lookup(en as Tree, key), `${key} [en]`).toBeTruthy();
      expect(lookup(ru as Tree, key), `${key} [ru]`).toBeTruthy();
    }
  });

  it("keeps the frames' section counts and numbers them 01 to 10", () => {
    expect(PRIVACY_POLICY.sections).toHaveLength(9);
    expect(TERMS_OF_USE.sections).toHaveLength(10);
    expect(sectionNumber(0)).toBe("01");
    expect(sectionNumber(9)).toBe("10");
  });
});
