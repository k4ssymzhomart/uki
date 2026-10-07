// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCsp, supabaseConnectSources } from "./csp.ts";
import { APP_ORIGIN, isAppUrl, originOf, resourceUrl } from "./origin.ts";

const RENDERER = fileURLToPath(new URL("../renderer", import.meta.url));
const UI_SRC = fileURLToPath(new URL("../../../../packages/ui/src", import.meta.url));

/** Source files that ship: no tests, galleries, test helpers or development-only overlays. */
function shippedSources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !/\.(test|gallery|dev)\.tsx?$|(^|[\\/])gallery\.tsx$|(^|[\\/])(test|dev-overlay)[\\/]/.test(file),
    )
    .map((file) => join(dir, file));
}

/**
 * @uki/ui exports built on Radix primitives whose scroll lock (react-remove-scroll) injects a <style>
 * element: Dialog, AlertDialog, Select and the menus. Barrels are skipped so only real users count.
 */
function scrollLockingExports(): Set<string> {
  const files = shippedSources(UI_SRC).filter((file) => !/^index\.tsx?$/.test(basename(file)));
  const source = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const locking = new Set(
    files.filter((file) =>
      /import \{ (AlertDialog|ContextMenu|Dialog|DropdownMenu|Menubar|Select)\b[^}]*\} from "radix-ui"/.test(
        source.get(file) ?? "",
      ),
    ),
  );
  for (let grew = true; grew; ) {
    grew = false;
    for (const file of files) {
      if (locking.has(file)) continue;
      const relative = [...(source.get(file) ?? "").matchAll(/from "(\.{1,2}\/[^"]+)"/g)];
      if (relative.some(([, path]) => path && locking.has(resolve(dirname(file), path)))) {
        locking.add(file);
        grew = true;
      }
    }
  }
  const names = new Set<string>();
  for (const file of locking) {
    for (const [, name] of (source.get(file) ?? "").matchAll(/export (?:function|const|class) (\w+)/g)) {
      if (name) names.add(name);
    }
  }
  return names;
}

describe("buildCsp", () => {
  it("is exactly the plan's policy for a cloud project", () => {
    expect(buildCsp({ supabaseUrl: "https://abcdefghij.supabase.co" })).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; " +
        "connect-src 'self' https://abcdefghij.supabase.co wss://abcdefghij.supabase.co; " +
        "img-src 'self' blob: data:; media-src 'self' blob: mediastream:",
    );
  });

  it("uses http and ws for the local stack, and no host when none is set", () => {
    expect(supabaseConnectSources("http://127.0.0.1:54721")).toEqual([
      "http://127.0.0.1:54721",
      "ws://127.0.0.1:54721",
    ]);
    expect(buildCsp()).toContain("connect-src 'self';");
    expect(() => supabaseConnectSources("ftp://x")).toThrow();
  });

  it("relaxes only the dev server policy", () => {
    const dev = buildCsp({ supabaseUrl: "http://127.0.0.1:54721", dev: true });
    expect(dev).toContain("'unsafe-inline'");
    expect(dev).toContain(APP_ORIGIN);
    expect(buildCsp({ supabaseUrl: "http://127.0.0.1:54721" })).not.toContain("unsafe-inline");
  });

  // The build policy has no style-src, so default-src 'self' blocks every inline <style> element. A
  // production build checked under this header on 2026-10-07 logged no style violations for the
  // student window or any of the 14 student frames, and style-src-elem violations for the UI kit's
  // Dialog and modal menus (Radix's scroll lock). Using one of those in the renderer needs
  // style-src 'self' 'unsafe-inline' in the build policy first, and this test updated.
  it("keeps styles strict while the renderer uses no scroll-locking Radix overlay", () => {
    expect(buildCsp({ supabaseUrl: "https://abcdefghij.supabase.co" })).not.toContain("style-src");
    const locking = scrollLockingExports();
    expect([...locking]).toEqual(expect.arrayContaining(["Dialog", "Select", "MenuContent", "ActionMenu"]));
    const used = shippedSources(RENDERER).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@uki\/ui[^"]*"/g)]
        .flatMap(([, names]) => (names ?? "").split(","))
        .map(
          (name) =>
            name
              .replace(/^\s*type\s+/, "")
              .split(/\s+as\s+/)[0]
              ?.trim() ?? "",
        )
        .filter((name) => locking.has(name))
        .map((name) => `${name} in ${file.slice(RENDERER.length + 1)}`),
    );
    expect(used).toEqual([]);
  });
});

describe("origins", () => {
  it("recognises the app's own pages", () => {
    expect(originOf("uki://app/index.html")).toBe(APP_ORIGIN);
    expect(isAppUrl("uki://app/index.html")).toBe(true);
    expect(isAppUrl("uki://other/index.html")).toBe(false);
    expect(isAppUrl("https://example.com/")).toBe(false);
    expect(isAppUrl("http://localhost:5173/#/gallery")).toBe(false);
    expect(isAppUrl("http://localhost:5173/#/gallery", "http://localhost:5173/")).toBe(true);
    expect(isAppUrl("not a url")).toBe(false);
  });

  it("builds resource URLs and refuses traversal", () => {
    expect(resourceUrl("models/manifest.json")).toBe("uki://app/resources/models/manifest.json");
    expect(resourceUrl("/models/human/face model.json")).toBe(
      "uki://app/resources/models/human/face%20model.json",
    );
    expect(() => resourceUrl("../out/main/index.js")).toThrow();
    expect(() => resourceUrl("")).toThrow();
  });
});
