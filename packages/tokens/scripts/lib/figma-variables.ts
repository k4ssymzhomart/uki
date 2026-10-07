import { z } from "zod";

/**
 * Shape of packages/tokens/figma-variables.json, the export of the 72 local Figma variables.
 * Colour values are 6- or 8-digit hex (8 digits carry alpha) or an alias to a primitive by name.
 */

const hexColour = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "expected #rrggbb or #rrggbbaa");
const alias = z.strictObject({ alias: z.string().min(1) });
const webName = z.string().regex(/^var\(--uki-[a-z0-9-]+\)$/, "expected var(--uki-name)");

const colourVariable = z.strictObject({
  name: z.string().min(1),
  type: z.literal("COLOR"),
  web: webName,
  values: z.record(z.string(), z.union([hexColour, alias])),
});

const floatVariable = z.strictObject({
  name: z.string().min(1),
  type: z.literal("FLOAT"),
  web: webName,
  values: z.record(z.string(), z.number().nonnegative()),
});

const collection = z.strictObject({
  name: z.string().min(1),
  modes: z.array(z.string().min(1)).min(1),
  variables: z.array(z.discriminatedUnion("type", [colourVariable, floatVariable])),
});

export const figmaVariablesSchema = z.strictObject({
  file: z.string().min(1),
  exported: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  about: z.string(),
  collections: z.array(collection).min(1),
});

export type FigmaVariables = z.infer<typeof figmaVariablesSchema>;
export type FigmaCollection = z.infer<typeof collection>;
export type FigmaColourVariable = z.infer<typeof colourVariable>;
export type FigmaFloatVariable = z.infer<typeof floatVariable>;
export type FigmaVariable = FigmaColourVariable | FigmaFloatVariable;
export type FigmaColourValue = string | { alias: string };

/** Parses and checks the export: mode names, aliases and CSS names must all resolve. */
export function parseFigmaVariables(input: unknown): FigmaVariables {
  const parsed = figmaVariablesSchema.parse(input);
  const problems: string[] = [];
  const names = new Set<string>();
  const cssNames = new Set<string>();
  const primitives = new Map<string, FigmaVariable>();

  for (const c of parsed.collections) {
    for (const v of c.variables) {
      if (names.has(v.name)) problems.push(`duplicate variable name ${v.name}`);
      names.add(v.name);
      const css = cssName(v);
      if (cssNames.has(css)) problems.push(`duplicate CSS name ${css}`);
      cssNames.add(css);
      for (const mode of c.modes) {
        if (!(mode in v.values)) problems.push(`${c.name}/${v.name} has no value for mode ${mode}`);
      }
      for (const mode of Object.keys(v.values)) {
        if (!c.modes.includes(mode))
          problems.push(`${c.name}/${v.name} has a value for unknown mode ${mode}`);
      }
      if (c.name === "Primitives") primitives.set(v.name, v);
    }
  }

  for (const c of parsed.collections) {
    for (const v of c.variables) {
      if (v.type !== "COLOR") continue;
      for (const [mode, value] of Object.entries(v.values)) {
        if (typeof value === "string") continue;
        const target = primitives.get(value.alias);
        if (!target) problems.push(`${v.name} (${mode}) aliases unknown primitive ${value.alias}`);
        else if (target.type !== "COLOR")
          problems.push(`${v.name} (${mode}) aliases non-colour ${value.alias}`);
      }
    }
  }

  if (problems.length > 0) throw new Error(`figma-variables.json is invalid:\n- ${problems.join("\n- ")}`);
  return parsed;
}

/** `var(--uki-bg-canvas)` becomes `--uki-bg-canvas`. */
export function cssName(v: Pick<FigmaVariable, "web">): string {
  return v.web.slice("var(".length, -1);
}

export function countVariables(vars: FigmaVariables): number {
  return vars.collections.reduce((n, c) => n + c.variables.length, 0);
}
