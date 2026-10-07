// "No colour, size or radius literals in components: Tailwind classes generated from the tokens only"
// (docs/phase-0-plan.md, Conventions; Gates on every merge to main). Reads every component file
// (.tsx under apps/*/src and packages/ui/src) except the galleries, the brand art, tests and generated
// files, with comments masked out.
import { type Guard, globToRegExp, maskComments, matchesAny, type Violation, violation } from "./guard.ts";

const COMPONENTS = [globToRegExp("apps/*/src/**/*.tsx"), globToRegExp("packages/ui/src/**/*.tsx")];

/** Development-only pages, the brand art (SVG drawings), tests and generated code. */
export const COLOUR_EXEMPT = [
  "**/*.gallery.tsx",
  "**/gallery.tsx",
  "**/gallery/**",
  "**/*.test.tsx",
  "packages/ui/src/art/**",
  "**/generated/**",
  "**/*.generated.tsx",
].map(globToRegExp);

interface Rule {
  pattern: RegExp;
  message: string;
}

const RULES: readonly Rule[] = [
  {
    pattern: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
    message: "hex colour: use a token class such as bg-surface or text-fg-primary",
  },
  {
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/g,
    message: "colour function: use a token class (opacity with /NN, e.g. bg-inverse/40)",
  },
  {
    pattern: /(?<![\w.$-])-?\d*\.?\d+px\b/g,
    message: "pixel size: use the 4 px spacing scale (p-5 = 20 px) or a token radius/type class",
  },
  {
    pattern: /\[[^\]\s"'`]*?\d(?:\.\d+)?(?:rem|em)\b[^\]]*\]/g,
    message: "arbitrary rem/em size: use the spacing scale or a type-* class",
  },
  {
    pattern:
      /style=\{\{[^}]*?\b(?:width|height|minWidth|minHeight|maxWidth|maxHeight|top|right|bottom|left|inset|margin\w*|padding\w*|gap|rowGap|columnGap|fontSize|lineHeight|letterSpacing|borderRadius|borderWidth|outlineWidth)\s*:\s*-?\d/g,
    message: "numeric size in an inline style (React adds px): use a class from the tokens",
  },
];

/**
 * Responsive-image hints (`sizes="(min-width: 1280px) 640px, 40vw"`) and `<source media>` queries
 * choose which file to download; they style nothing, so their values are masked like comments.
 */
const LOADING_HINTS = /\b(?:sizes|media)=(?:"[^"]*"|'[^']*'|\{\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*\})/g;

function maskLoadingHints(code: string): string {
  return code.replace(LOADING_HINTS, (hint) => hint.replace(/[^\n]/g, " "));
}

export const colourLiteralsGuard: Guard = {
  id: "no-colour-or-size-literals",
  title: "no colour, pixel or radius literals in component files",
  applies: (path) => matchesAny(path, COMPONENTS) && !matchesAny(path, COLOUR_EXEMPT),
  check(path, text) {
    const code = maskLoadingHints(maskComments(text));
    const found: Violation[] = [];
    for (const rule of RULES) {
      for (const match of code.matchAll(rule.pattern)) {
        found.push(violation(path, text, match.index, this.id, `${rule.message} (found "${match[0]}")`));
      }
    }
    return found.sort((a, b) => a.line - b.line || a.column - b.column);
  },
};
