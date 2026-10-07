import {
  EFFECTS,
  type Effect,
  FONT_STACKS,
  FONT_WEIGHTS,
  type FontRole,
  SEMANTIC_GROUP_ORDER,
  TEXT_STYLES,
  type TextStyle,
  THEME_COLOUR_PREFIX,
  THEME_PRIMITIVE_COLOURS,
} from "./design-inputs.ts";
import {
  cssName,
  type FigmaColourValue,
  type FigmaColourVariable,
  type FigmaFloatVariable,
  type FigmaVariables,
} from "./figma-variables.ts";

/**
 * Pure generators for packages/tokens/src. Output is formatted the way Biome formats CSS (one
 * declaration per line, lowercase hex), so `biome check` passes on the generated files and two runs
 * on the same input give byte-identical files.
 */

const PRIMITIVES = "Primitives";
const COLOUR = "Color";
const LAYOUT = "Layout";
const LIGHT = "Light";
const DARK = "Dark";

export interface Primitive {
  readonly name: string;
  readonly css: string;
  readonly hex: string;
}

export interface SemanticColour {
  readonly name: string;
  readonly group: string;
  readonly css: string;
  readonly light: FigmaColourValue;
  readonly dark: FigmaColourValue;
}

export interface LayoutToken {
  readonly name: string;
  readonly group: string;
  readonly css: string;
  readonly px: number;
}

export interface TokenModel {
  readonly file: string;
  readonly exported: string;
  readonly primitives: readonly Primitive[];
  readonly semantic: readonly SemanticColour[];
  readonly layout: readonly LayoutToken[];
}

function collection(vars: FigmaVariables, name: string) {
  const c = vars.collections.find((x) => x.name === name);
  if (!c) throw new Error(`figma-variables.json has no "${name}" collection`);
  return c;
}

function groupOf(name: string): string {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(0, slash);
}

/** Stable sort by group: groups in `order` first, then the rest in first-appearance order. */
function byGroup<T extends { group: string }>(items: readonly T[], order: readonly string[] = []): T[] {
  const groups: string[] = [...order];
  for (const item of items) if (!groups.includes(item.group)) groups.push(item.group);
  return groups.flatMap((g) => items.filter((item) => item.group === g));
}

export function buildModel(vars: FigmaVariables): TokenModel {
  const primitiveVars = collection(vars, PRIMITIVES).variables.filter(
    (v): v is FigmaColourVariable => v.type === "COLOR",
  );
  const primitives = byGroup(
    primitiveVars.map((v) => {
      const value = v.values.Value;
      if (typeof value !== "string") throw new Error(`primitive ${v.name} must hold a hex value`);
      return { name: v.name, group: groupOf(v.name), css: cssName(v), hex: value };
    }),
  ).map(({ name, css, hex }) => ({ name, css, hex }));

  const colourCollection = collection(vars, COLOUR);
  for (const mode of [LIGHT, DARK]) {
    if (!colourCollection.modes.includes(mode)) throw new Error(`the Color collection has no ${mode} mode`);
  }
  const semantic = byGroup(
    colourCollection.variables
      .filter((v): v is FigmaColourVariable => v.type === "COLOR")
      .map((v) => {
        const light = v.values[LIGHT];
        const dark = v.values[DARK];
        if (light === undefined || dark === undefined)
          throw new Error(`${v.name} needs Light and Dark values`);
        return { name: v.name, group: groupOf(v.name), css: cssName(v), light, dark };
      }),
    SEMANTIC_GROUP_ORDER,
  );

  const layout = byGroup(
    collection(vars, LAYOUT)
      .variables.filter((v): v is FigmaFloatVariable => v.type === "FLOAT")
      .map((v) => {
        const px = Object.values(v.values)[0];
        if (px === undefined) throw new Error(`${v.name} has no value`);
        return { name: v.name, group: groupOf(v.name), css: cssName(v), px };
      }),
  );

  return { file: vars.file, exported: vars.exported, primitives, semantic, layout };
}

// ---------------------------------------------------------------------------------------------
// Values

/** Formats a number without float noise: 0.045, not 0.045000000000000005. */
export function num(n: number): string {
  return String(Number(n.toFixed(4)));
}

function px(n: number): string {
  return n === 0 ? "0" : `${num(n)}px`;
}

function hexChannels(hex: string): [number, number, number, number] {
  const h = hex.slice(1);
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? Math.round((Number.parseInt(h.slice(6, 8), 16) / 255) * 100) / 100 : 1;
  return [r, g, b, a];
}

/** `#E6F5A8` becomes `#e6f5a8`; `#ffffff14` becomes `rgb(255 255 255 / 0.08)`. */
export function cssColour(hex: string): string {
  if (hex.length === 7) return hex.toLowerCase();
  const [r, g, b, a] = hexChannels(hex);
  return `rgb(${r} ${g} ${b} / ${num(a)})`;
}

/** Resolved colour for JS consumers such as canvas: `#e6f5a8` or `rgba(255, 255, 255, 0.08)`. */
export function jsColour(hex: string): string {
  if (hex.length === 7) return hex.toLowerCase();
  const [r, g, b, a] = hexChannels(hex);
  return `rgba(${r}, ${g}, ${b}, ${num(a)})`;
}

function primitiveByName(model: TokenModel, name: string): Primitive {
  const p = model.primitives.find((x) => x.name === name);
  if (!p) throw new Error(`unknown primitive ${name}`);
  return p;
}

function semanticByName(model: TokenModel, name: string): SemanticColour {
  const s = model.semantic.find((x) => x.name === name);
  if (!s) throw new Error(`unknown semantic colour ${name}`);
  return s;
}

function cssValue(model: TokenModel, value: FigmaColourValue): string {
  return typeof value === "string" ? cssColour(value) : `var(${primitiveByName(model, value.alias).css})`;
}

function resolvedHex(model: TokenModel, value: FigmaColourValue): string {
  return typeof value === "string" ? value : primitiveByName(model, value.alias).hex;
}

function sameValue(a: FigmaColourValue, b: FigmaColourValue): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
  }
  return a.alias === b.alias;
}

function effectCss(model: TokenModel, effect: Effect): string {
  if (effect.value.kind === "shadow") {
    return effect.value.layers
      .map((l) => {
        const [r, g, b, a] = l.rgba;
        return `${px(l.x)} ${px(l.y)} ${px(l.blur)} ${px(l.spread)} rgb(${r} ${g} ${b} / ${num(a)})`;
      })
      .join(", ");
  }
  return `0 0 0 ${px(effect.value.width)} var(${semanticByName(model, effect.value.colour).css})`;
}

function effectResolved(model: TokenModel, effect: Effect, mode: "light" | "dark"): string {
  if (effect.value.kind === "shadow") return effectCss(model, effect);
  const colour = semanticByName(model, effect.value.colour);
  return `0 0 0 ${px(effect.value.width)} ${jsColour(resolvedHex(model, colour[mode]))}`;
}

/** Effects that reference a colour which changes in Dark must be declared again under [data-theme="dark"]. */
function effectsThatFollowTheme(model: TokenModel): Effect[] {
  return EFFECTS.filter((e) => {
    if (e.value.kind !== "ring") return false;
    const colour = semanticByName(model, e.value.colour);
    return !sameValue(colour.light, colour.dark);
  });
}

// ---------------------------------------------------------------------------------------------
// tokens.css

export function generateTokensCss(model: TokenModel): string {
  const decl = (css: string, value: string) => `  ${css}: ${value};`;
  const lines: string[] = [
    "/* packages/tokens/src/tokens.css · generated from Figma variables, do not edit by hand */",
    `/* Source: figma-variables.json, Figma file ${model.file}, exported ${model.exported}. Rebuild with pnpm tokens. */`,
    ":root {",
    "  /* Primitives */",
    ...model.primitives.map((p) => decl(p.css, cssColour(p.hex))),
    "",
    "  /* Layout */",
    ...model.layout.map((l) => decl(l.css, px(l.px))),
    "",
    "  /* Effects */",
    ...EFFECTS.map((e) => decl(`--${e.css}`, effectCss(model, e))),
    "",
    "  /* Colour · Light */",
    ...model.semantic.map((s) => decl(s.css, cssValue(model, s.light))),
    "}",
    "",
    '[data-theme="dark"] {',
    "  /* Colour · Dark: only the tokens whose value changes */",
    ...model.semantic
      .filter((s) => !sameValue(s.light, s.dark))
      .map((s) => decl(s.css, cssValue(model, s.dark))),
  ];
  const themed = effectsThatFollowTheme(model);
  if (themed.length > 0) {
    lines.push(
      "",
      "  /* Effects that use a themed colour: a custom property resolves var() where it is declared */",
      ...themed.map((e) => decl(`--${e.css}`, effectCss(model, e))),
    );
  }
  lines.push("}", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// theme.css

export function themeColourName(semanticName: string): string {
  const group = groupOf(semanticName);
  const prefix = THEME_COLOUR_PREFIX[group];
  if (prefix === undefined)
    throw new Error(`no Tailwind prefix for colour group "${group}" (${semanticName})`);
  return `${prefix}${semanticName.slice(group.length + 1)}`;
}

export function fontStack(role: FontRole): string {
  return FONT_STACKS[role].join(", ");
}

export function generateThemeCss(model: TokenModel): string {
  const colours: [string, string][] = model.semantic.map((s) => [
    `--color-${themeColourName(s.name)}`,
    `var(${s.css})`,
  ]);
  for (const name of THEME_PRIMITIVE_COLOURS) {
    const p = primitiveByName(model, name);
    colours.push([`--color-${name}`, `var(${p.css})`]);
  }
  colours.push(["--color-transparent", "transparent"]);

  const seen = new Set<string>();
  for (const [key] of colours) {
    if (seen.has(key)) throw new Error(`two colours map to ${key}`);
    seen.add(key);
  }

  const radii = model.layout
    .filter((l) => l.group === "radius")
    .map((l) => [`--radius-${l.name.slice("radius/".length)}`, `var(${l.css})`] as const);
  const shadows = EFFECTS.map((e) => [`--shadow-${e.theme}`, `var(--${e.css})`] as const);

  const decl = ([k, v]: readonly [string, string]) => `  ${k}: ${v};`;
  return [
    "/* packages/tokens/src/theme.css · generated by scripts/build.ts, do not edit by hand */",
    "/* Spacing keeps Tailwind's 4 px scale: p-5 is space/20, p-30 is space/120, p-40 is space/160. */",
    '@import "tailwindcss";',
    '@import "./tokens.css";',
    '@import "./type.css";',
    '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
    "",
    "@theme inline {",
    "  --color-*: initial;",
    ...colours.map(decl),
    ...radii.map(decl),
    ...shadows.map(decl),
    `  --font-sans: ${fontStack("sans")};`,
    `  --font-mono: ${fontStack("mono")};`,
    "}",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// type.css

/** Display/XL becomes type-display-xl, Heading/H1 becomes type-h1, Label/M Strong becomes type-label-m-strong. */
export function utilityName(figma: string): string {
  const slug = figma
    .toLowerCase()
    .replace(/[/\s]+/g, "-")
    .replace(/^heading-/, "");
  return `type-${slug}`;
}

export function textStyleDeclarations(style: TextStyle): [string, string][] {
  const lineHeight = style.lineHeight === "auto" ? "normal" : num(style.lineHeight / 100);
  const decls: [string, string][] = [
    ["font", `${FONT_WEIGHTS[style.weight]} ${num(style.size)}px / ${lineHeight} var(--font-${style.font})`],
  ];
  if (style.tracking !== 0) decls.push(["letter-spacing", `${num(style.tracking / 100)}em`]);
  if (style.uppercase) decls.push(["text-transform", "uppercase"]);
  return decls;
}

export function generateTypeCss(): string {
  const names = new Set<string>();
  const blocks = TEXT_STYLES.map((style) => {
    const name = utilityName(style.figma);
    if (names.has(name)) throw new Error(`two text styles map to ${name}`);
    names.add(name);
    return [
      `/* ${style.figma} */`,
      `@utility ${name} {`,
      ...textStyleDeclarations(style).map(([k, v]) => `  ${k}: ${v};`),
      "}",
    ].join("\n");
  });
  return [
    "/* packages/tokens/src/type.css · generated by scripts/build.ts from the Figma text styles, do not edit by hand */",
    "/* Percent line heights are unitless numbers; tracking in percent is em. */",
    blocks.join("\n\n"),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// fonts.css

export interface FontFallback {
  /** Code points Geist or Geist Mono cannot draw. */
  readonly codePoints: readonly number[];
  /** url() of the Inter Variable subset file that draws them, relative to src/fonts.css. */
  readonly url: string;
}

/** `[0x492, 0x493, 0x49a]` becomes `U+0492-0493, U+049A`. */
export function unicodeRange(codePoints: readonly number[]): string {
  const sorted = [...new Set(codePoints)].sort((a, b) => a - b);
  const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, "0");
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i] as number;
    let end = start;
    while (sorted[i + 1] === end + 1) {
      end += 1;
      i += 1;
    }
    parts.push(start === end ? `U+${hex(start)}` : `U+${hex(start)}-${hex(end)}`);
    i += 1;
  }
  return parts.join(", ");
}

export function generateFontsCss(fallback: FontFallback | null): string {
  const lines = [
    "/* packages/tokens/src/fonts.css · generated by scripts/build.ts, do not edit by hand */",
    "/* Geist and Geist Mono are bundled from Fontsource with each app; never a font CDN. */",
    '@import "@fontsource-variable/geist";',
    '@import "@fontsource-variable/geist-mono";',
  ];
  if (fallback && fallback.codePoints.length > 0) {
    const letters = fallback.codePoints.map((cp) => String.fromCodePoint(cp)).join(" ");
    lines.push(
      "",
      `/* Geist lacks these Kazakh letters, so Inter Variable draws exactly them: ${letters} */`,
      "/* Checked by pnpm --filter @uki/tokens glyphs. */",
      "@font-face {",
      '  font-family: "Inter Variable";',
      "  font-style: normal;",
      "  font-display: swap;",
      "  font-weight: 100 900;",
      `  src: url("${fallback.url}") format("woff2-variations");`,
      `  unicode-range: ${unicodeRange(fallback.codePoints)};`,
      "}",
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// tokens.json

export interface TokensJson {
  readonly source: { readonly file: string; readonly exported: string };
  readonly primitives: Record<string, string>;
  readonly color: { readonly light: Record<string, string>; readonly dark: Record<string, string> };
  readonly space: Record<string, number>;
  readonly radius: Record<string, number>;
  readonly shadow: Record<string, { readonly light: string; readonly dark: string }>;
  readonly font: Record<FontRole, string>;
}

const short = (css: string) => css.replace(/^--uki-/, "");

export function buildTokensJson(model: TokenModel): TokensJson {
  const colour = (mode: "light" | "dark") =>
    Object.fromEntries(model.semantic.map((s) => [short(s.css), jsColour(resolvedHex(model, s[mode]))]));
  const layout = (group: string) =>
    Object.fromEntries(
      model.layout.filter((l) => l.group === group).map((l) => [l.name.slice(group.length + 1), l.px]),
    );
  return {
    source: { file: model.file, exported: model.exported },
    primitives: Object.fromEntries(model.primitives.map((p) => [short(p.css), jsColour(p.hex)])),
    color: { light: colour("light"), dark: colour("dark") },
    space: layout("space"),
    radius: layout("radius"),
    shadow: Object.fromEntries(
      EFFECTS.map((e) => [
        e.theme,
        { light: effectResolved(model, e, "light"), dark: effectResolved(model, e, "dark") },
      ]),
    ),
    font: { sans: fontStack("sans"), mono: fontStack("mono") },
  };
}

export function generateTokensJson(model: TokenModel): string {
  return `${JSON.stringify(buildTokensJson(model), null, 2)}\n`;
}
