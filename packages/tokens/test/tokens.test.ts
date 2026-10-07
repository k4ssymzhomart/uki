import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateAll } from "../scripts/build.ts";
import { TEXT_STYLES } from "../scripts/lib/design-inputs.ts";
import { countVariables, cssName, parseFigmaVariables } from "../scripts/lib/figma-variables.ts";
import {
  buildModel,
  cssColour,
  themeColourName,
  unicodeRange,
  utilityName,
} from "../scripts/lib/generate.ts";
import { colour, tokens } from "../src/index.ts";
import { block, normalise, parseCss, planBlock, readSrc, TOKENS_ROOT } from "./css.ts";

const vars = parseFigmaVariables(JSON.parse(readFileSync(join(TOKENS_ROOT, "figma-variables.json"), "utf8")));
const model = buildModel(vars);
const generated = parseCss(readSrc("tokens.css"));
const plan = parseCss(planBlock("packages/tokens/src/tokens.css"));

/**
 * The one declaration tokens.css adds to the plan's block: a custom property resolves var() where it
 * is declared, so --uki-focus-ring declared on :root keeps the Light ring colour inside
 * [data-theme="dark"] unless it is declared there again. The handoff asks for a ring that follows the theme.
 */
const DARK_ADDITIONS = new Map([["--uki-focus-ring", normalise("0 0 0 4px var(--uki-border-focus-ring)")]]);

function entries(map: Map<string, string>): [string, string][] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

describe("generated files", () => {
  it("are up to date with figma-variables.json and deterministic", () => {
    const first = generateAll();
    const second = generateAll();
    expect(second).toEqual(first);
    for (const [path, content] of Object.entries(first)) {
      expect(readFileSync(join(TOKENS_ROOT, path), "utf8"), `${path} is stale: run pnpm tokens`).toBe(
        content,
      );
    }
  });

  it("parse without duplicate declarations", () => {
    for (const file of ["tokens.css", "theme.css", "type.css", "fonts.css"]) {
      expect(parseCss(readSrc(file)).duplicates, file).toEqual([]);
    }
  });
});

describe("tokens.css", () => {
  it("equals the plan's :root block declaration by declaration", () => {
    // 20 primitives, 18 layout, 2 effects, 34 semantic colours.
    expect(block(plan, ":root").size).toBe(74);
    expect(entries(block(generated, ":root"))).toEqual(entries(block(plan, ":root")));
  });

  it('equals the plan\'s [data-theme="dark"] block, plus the themed focus ring', () => {
    expect(block(plan, '[data-theme="dark"]').size).toBe(22);
    const expected = new Map([...block(plan, '[data-theme="dark"]'), ...DARK_ADDITIONS]);
    expect(entries(block(generated, '[data-theme="dark"]'))).toEqual(entries(expected));
  });

  it("has only the two blocks the plan prints", () => {
    expect([...generated.blocks.keys()]).toEqual([...plan.blocks.keys()]);
    expect(generated.statements).toEqual([]);
  });

  it("declares every one of the 72 Figma variables", () => {
    expect(countVariables(vars)).toBe(72);
    const root = block(generated, ":root");
    const names = vars.collections.flatMap((c) => c.variables.map(cssName));
    expect(names).toHaveLength(72);
    for (const name of names) expect(root.has(name), name).toBe(true);
  });

  it("declares in Dark exactly the colours whose Dark value differs", () => {
    const dark = block(generated, '[data-theme="dark"]');
    const changing = model.semantic.filter((s) => JSON.stringify(s.light) !== JSON.stringify(s.dark));
    expect(changing).toHaveLength(22);
    for (const s of model.semantic) expect(dark.has(s.css), s.css).toBe(changing.includes(s));
  });
});

describe("theme.css", () => {
  const theme = parseCss(readSrc("theme.css"));
  const planTheme = parseCss(planBlock("packages/tokens/src/theme.css"));

  it("equals the plan's Tailwind theme block", () => {
    expect(planTheme.statements).toHaveLength(4);
    // --color-*, 34 semantic colours, white, transparent, 5 radii, 2 shadows, 2 fonts.
    expect(block(planTheme, "@theme inline").size).toBe(46);
    expect(theme.statements).toEqual(planTheme.statements);
    expect(entries(block(theme, "@theme inline"))).toEqual(entries(block(planTheme, "@theme inline")));
  });

  it("maps every semantic colour to a Tailwind colour", () => {
    const inline = block(theme, "@theme inline");
    expect(model.semantic).toHaveLength(34);
    for (const s of model.semantic) {
      expect(inline.get(`--color-${themeColourName(s.name)}`), s.name).toBe(`var(${s.css})`);
    }
    expect(inline.get("--color-*")).toBe("initial");
  });

  it("keeps Tailwind's 4 px spacing scale", () => {
    expect(readSrc("theme.css")).not.toMatch(/--spacing\s*:/);
  });

  it("names colours as the plan does", () => {
    expect(themeColourName("bg/canvas")).toBe("canvas");
    expect(themeColourName("text/primary")).toBe("fg-primary");
    expect(themeColourName("border/default")).toBe("line-default");
    expect(themeColourName("icon/accent")).toBe("icon-accent");
    expect(themeColourName("status/flag-subtle")).toBe("flag-subtle");
  });
});

describe("type.css", () => {
  const type = parseCss(readSrc("type.css"));
  const planType = parseCss(planBlock("packages/tokens/src/type.css"));

  it("has the 24 text styles as utilities", () => {
    expect(TEXT_STYLES).toHaveLength(24);
    expect([...type.blocks.keys()].filter((k) => k.startsWith("@utility type-"))).toHaveLength(24);
  });

  it("equals the plan's text styles declaration by declaration", () => {
    expect(planType.blocks.size).toBe(24);
    expect([...type.blocks.keys()]).toEqual([...planType.blocks.keys()]);
    for (const [prelude, decls] of planType.blocks) {
      expect(entries(block(type, prelude)), prelude).toEqual(entries(decls));
    }
  });

  it("names utilities after the Figma style", () => {
    expect(utilityName("Display/XL")).toBe("type-display-xl");
    expect(utilityName("Heading/H1")).toBe("type-h1");
    expect(utilityName("Label/M Strong")).toBe("type-label-m-strong");
    expect(utilityName("Mono/Display L")).toBe("type-mono-display-l");
    expect(utilityName("UI/Caption")).toBe("type-ui-caption");
  });
});

describe("fonts.css", () => {
  it("bundles Geist and Geist Mono from Fontsource, never a CDN", () => {
    const fonts = readSrc("fonts.css");
    expect(fonts).toContain('@import "@fontsource-variable/geist";');
    expect(fonts).toContain('@import "@fontsource-variable/geist-mono";');
    expect(fonts).not.toMatch(/https?:/);
  });
});

describe("tokens.json", () => {
  it("resolves every colour per mode as the handoff lists it", () => {
    expect(colour("bg-canvas")).toBe("#f6f5f1");
    expect(colour("bg-canvas", "dark")).toBe("#121310");
    expect(colour("text-accent", "dark")).toBe("#bce33c");
    expect(colour("status-flag-subtle", "dark")).toBe("#39241e");
    expect(colour("bg-glass")).toBe("rgba(255, 255, 255, 0.08)");
    expect(colour("border-glass", "dark")).toBe("rgba(255, 255, 255, 0.18)");
    expect(Object.keys(tokens.color.light)).toHaveLength(34);
    expect(Object.keys(tokens.color.dark)).toHaveLength(34);
    expect(Object.keys(tokens.primitives)).toHaveLength(20);
    expect(tokens.space["20"]).toBe(20);
    expect(tokens.radius.pill).toBe(999);
    expect(tokens.shadow.focus.light).toBe("0 0 0 4px #d3ee78");
    expect(tokens.shadow.focus.dark).toBe("0 0 0 4px #4a650c");
  });
});

describe("helpers", () => {
  it("formats colours", () => {
    expect(cssColour("#E6F5A8")).toBe("#e6f5a8");
    expect(cssColour("#ffffff14")).toBe("rgb(255 255 255 / 0.08)");
    expect(cssColour("#ffffff2e")).toBe("rgb(255 255 255 / 0.18)");
  });

  it("writes unicode ranges", () => {
    expect(unicodeRange([0x49b, 0x492, 0x493, 0x406])).toBe("U+0406, U+0492-0493, U+049B");
  });

  it("rejects a variable that aliases a missing primitive", () => {
    const broken = structuredClone(
      JSON.parse(readFileSync(join(TOKENS_ROOT, "figma-variables.json"), "utf8")),
    );
    broken.collections[1].variables[0].values.Light = { alias: "lime/999" };
    expect(() => parseFigmaVariables(broken)).toThrow(/unknown primitive lime\/999/);
  });
});
