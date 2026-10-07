/**
 * Design inputs that figma-variables.json does not carry: the 24 Figma text styles, the two effect
 * styles and the font stacks. Values are copied from Figma (Design Book, 7 Oct) as listed in
 * docs/design-handoff.md "Text styles (24)" and "Effects (2)", and printed in docs/phase-0-plan.md.
 * Edit them here when Figma changes, then run `pnpm tokens`.
 */

export type FontRole = "sans" | "mono";
export type FontWeightName = "Regular" | "Medium" | "SemiBold" | "Bold";

export interface TextStyle {
  /** The Figma style name, for example "Display/XL". */
  readonly figma: string;
  readonly font: FontRole;
  readonly weight: FontWeightName;
  /** Font size in px. */
  readonly size: number;
  /** Line height in percent of the font size, or "auto" (Figma's automatic line height). */
  readonly lineHeight: number | "auto";
  /** Letter spacing in percent of the font size; 0 means none. */
  readonly tracking: number;
  readonly uppercase?: boolean;
}

export const TEXT_STYLES: readonly TextStyle[] = [
  { figma: "Display/XL", font: "sans", weight: "Bold", size: 120, lineHeight: 100, tracking: -4 },
  { figma: "Display/L", font: "sans", weight: "Bold", size: 96, lineHeight: 100, tracking: -4 },
  { figma: "Display/M", font: "sans", weight: "Bold", size: 80, lineHeight: 96, tracking: -4.5 },
  { figma: "Heading/H1", font: "sans", weight: "Bold", size: 64, lineHeight: 105, tracking: -3.5 },
  { figma: "Heading/H2", font: "sans", weight: "Bold", size: 48, lineHeight: 110, tracking: -3 },
  { figma: "Heading/H3", font: "sans", weight: "SemiBold", size: 32, lineHeight: 120, tracking: -2 },
  { figma: "Body/L", font: "sans", weight: "Regular", size: 24, lineHeight: 150, tracking: -0.5 },
  { figma: "Body/M", font: "sans", weight: "Regular", size: 18, lineHeight: 150, tracking: 0 },
  { figma: "Body/S", font: "sans", weight: "Regular", size: 15, lineHeight: 150, tracking: 0 },
  { figma: "Label/M", font: "sans", weight: "Medium", size: 15, lineHeight: 130, tracking: 0 },
  { figma: "Label/M Strong", font: "sans", weight: "SemiBold", size: 15, lineHeight: 130, tracking: -0.5 },
  { figma: "Card/Title", font: "sans", weight: "SemiBold", size: 17, lineHeight: 130, tracking: -0.5 },
  { figma: "Card/Caption", font: "sans", weight: "Regular", size: 14, lineHeight: 145, tracking: 0 },
  { figma: "UI/Title", font: "sans", weight: "SemiBold", size: 26, lineHeight: 120, tracking: -1.5 },
  { figma: "UI/Label", font: "sans", weight: "Medium", size: 13, lineHeight: 130, tracking: 0 },
  { figma: "UI/Caption", font: "sans", weight: "Regular", size: 12, lineHeight: 140, tracking: 0 },
  { figma: "UI/Mono", font: "mono", weight: "Regular", size: 12, lineHeight: 140, tracking: 0 },
  { figma: "Mono/M", font: "mono", weight: "Regular", size: 18, lineHeight: 160, tracking: 0 },
  { figma: "Mono/S", font: "mono", weight: "Regular", size: 13, lineHeight: 140, tracking: 0 },
  {
    figma: "Mono/Overline",
    font: "mono",
    weight: "Medium",
    size: 13,
    lineHeight: 130,
    tracking: 6,
    uppercase: true,
  },
  {
    figma: "Mono/Tag",
    font: "mono",
    weight: "Medium",
    size: 11,
    lineHeight: 120,
    tracking: 6,
    uppercase: true,
  },
  { figma: "Mono/Display L", font: "mono", weight: "Regular", size: 44, lineHeight: 100, tracking: -3 },
  { figma: "Mono/Display M", font: "mono", weight: "Medium", size: 36, lineHeight: "auto", tracking: 0 },
  { figma: "Mono/Code", font: "mono", weight: "Medium", size: 34, lineHeight: "auto", tracking: 8 },
];

export const FONT_WEIGHTS: Readonly<Record<FontWeightName, number>> = {
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
};

/**
 * Font stacks for the Tailwind theme. "Inter Variable" stays second in the sans stack: it draws any
 * Kazakh letter Geist lacks (see scripts/glyph-check.ts and src/fonts.css).
 */
export const FONT_STACKS: Readonly<Record<FontRole, readonly string[]>> = {
  sans: ['"Geist Variable"', '"Inter Variable"', "system-ui", "sans-serif"],
  mono: ['"Geist Mono Variable"', "ui-monospace", "monospace"],
};

export interface DropShadow {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly spread: number;
  /** [r, g, b, alpha 0..1] */
  readonly rgba: readonly [number, number, number, number];
}

export interface Effect {
  /** CSS custom property, without the leading dashes, for example "uki-shadow-float". */
  readonly css: string;
  /** Tailwind theme key: `--shadow-<theme>`. */
  readonly theme: string;
  readonly figma: string;
  readonly value:
    | { readonly kind: "shadow"; readonly layers: readonly DropShadow[] }
    | { readonly kind: "ring"; readonly width: number; readonly colour: string };
}

export const EFFECTS: readonly Effect[] = [
  {
    css: "uki-shadow-float",
    theme: "float",
    figma: "Shadow/Float",
    value: {
      kind: "shadow",
      layers: [
        { x: 0, y: 14, blur: 36, spread: -6, rgba: [13, 15, 8, 0.14] },
        { x: 0, y: 2, blur: 6, spread: 0, rgba: [13, 15, 8, 0.08] },
      ],
    },
  },
  {
    css: "uki-focus-ring",
    theme: "focus",
    figma: "Focus/Ring",
    // The ring takes its colour from border/focus-ring so it follows the theme (handoff, Effects).
    value: { kind: "ring", width: 4, colour: "border/focus-ring" },
  },
];

/** How each semantic colour group becomes a Tailwind colour name: bg/canvas is `bg-canvas`, text/primary is `text-fg-primary`. */
export const THEME_COLOUR_PREFIX: Readonly<Record<string, string>> = {
  bg: "",
  text: "fg-",
  border: "line-",
  icon: "icon-",
  status: "",
};

/** Order of the semantic groups in tokens.css and theme.css. */
export const SEMANTIC_GROUP_ORDER: readonly string[] = ["bg", "text", "border", "icon", "status"];

/** Primitives that also become Tailwind colours, besides the semantic tokens. */
export const THEME_PRIMITIVE_COLOURS: readonly string[] = ["white"];
