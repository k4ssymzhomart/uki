import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";
import { readSrc, TOKENS_ROOT } from "./css.ts";

const require = createRequire(import.meta.url);

/** Compiles src/theme.css with Tailwind v4 the way an app's CSS pipeline does, and builds the given classes. */
async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(readSrc("theme.css"), {
    base: join(TOKENS_ROOT, "src"),
    async loadStylesheet(id: string, base: string) {
      const path = id === "tailwindcss" ? require.resolve("tailwindcss/index.css") : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  return compiler.build(candidates);
}

/** The declarations of one generated rule, by its selector as Tailwind prints it. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("theme.css through Tailwind v4", () => {
  let css = "";
  beforeAll(async () => {
    css = await build([
      "bg-canvas",
      "text-fg-primary",
      "border-line-default",
      "text-icon-accent",
      "bg-flag-subtle",
      "rounded-card",
      "rounded-pill",
      "shadow-float",
      "shadow-focus",
      "type-ui-label",
      "type-mono-tag",
      "md:type-h1",
      "p-5",
      "p-30",
      "p-40",
      "dark:bg-surface",
      "bg-red-500",
      "text-white",
      "bg-transparent",
      "font-sans",
    ]);
  });

  it("generates the plan's utility names from the tokens", () => {
    expect(rule(css, ".bg-canvas")).toContain("background-color: var(--uki-bg-canvas)");
    expect(rule(css, ".text-fg-primary")).toContain("color: var(--uki-text-primary)");
    expect(rule(css, ".border-line-default")).toContain("border-color: var(--uki-border-default)");
    expect(rule(css, ".text-icon-accent")).toContain("color: var(--uki-icon-accent)");
    expect(rule(css, ".bg-flag-subtle")).toContain("background-color: var(--uki-status-flag-subtle)");
    expect(rule(css, ".rounded-card")).toContain("border-radius: var(--uki-radius-card)");
    expect(rule(css, ".shadow-float")).toContain("--tw-shadow: var(--uki-shadow-float)");
    expect(rule(css, ".shadow-focus")).toContain("--tw-shadow: var(--uki-focus-ring)");
    expect(rule(css, ".text-white")).toContain("color: var(--uki-white)");
  });

  it("keeps the 4 px spacing scale: p-5 is 20 px, p-30 is 120 px, p-40 is 160 px", () => {
    expect(css).toContain("--spacing: 0.25rem;");
    expect(rule(css, ".p-5")).toContain("padding: calc(var(--spacing) * 5)");
    expect(rule(css, ".p-30")).toContain("padding: calc(var(--spacing) * 30)");
    expect(rule(css, ".p-40")).toContain("padding: calc(var(--spacing) * 40)");
  });

  it("drops Tailwind's default palette", () => {
    expect(css).not.toContain(".bg-red-500");
  });

  it("emits the text styles with their font variables defined", () => {
    expect(rule(css, ".type-ui-label")).toContain("font: 500 13px / 1.3 var(--font-sans)");
    expect(rule(css, ".type-mono-tag")).toContain("text-transform: uppercase");
    expect(css).toContain('--font-sans: "Geist Variable", "Inter Variable", system-ui, sans-serif;');
    expect(css).toContain('--font-mono: "Geist Mono Variable", ui-monospace, monospace;');
    expect(css).toMatch(/\.md\\:type-h1 \{\s*font: 700 64px \/ 1\.05 var\(--font-sans\)/);
  });

  it("switches to Dark under data-theme=dark", () => {
    expect(css).toContain('.dark\\:bg-surface:where([data-theme="dark"], [data-theme="dark"] *)');
    expect(css).toMatch(/\[data-theme="dark"\] \{[^}]*--uki-bg-canvas: var\(--uki-ink-900\)/);
    expect(css).toMatch(
      /\[data-theme="dark"\] \{[^}]*--uki-focus-ring: 0 0 0 4px var\(--uki-border-focus-ring\)/,
    );
  });
});
