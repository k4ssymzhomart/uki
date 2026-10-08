// Every function carries its own deno.json (what `supabase functions deploy` bundles with); the one in
// supabase/functions is for editors and `functions serve`. They must pin the same versions, and those
// must match the workspace's lockfile versions the apps run.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FUNCTIONS = [
  "ingest",
  "frames",
  "command",
  "stills",
  "pilot-notify",
  "shared-report",
  "data-request",
  "retention",
] as const;
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as unknown;

describe("deno.json import maps", () => {
  const shared = read("../deno.json") as { imports: Record<string, string> };

  it.each(FUNCTIONS)("%s/deno.json matches supabase/functions/deno.json", (name) => {
    expect(read(`../${name}/deno.json`)).toEqual(shared);
  });

  it("pins exact npm versions for zod, @supabase/server and @supabase/supabase-js", () => {
    expect(Object.keys(shared.imports).sort()).toEqual(["@supabase/server", "@supabase/supabase-js", "zod"]);
    for (const specifier of Object.values(shared.imports)) {
      expect(specifier).toMatch(/^npm:(@[a-z-]+\/)?[a-z-]+@\d+\.\d+\.\d+$/);
    }
  });

  it("uses the same zod and supabase-js versions as the workspace", () => {
    const zod = read("../../../node_modules/zod/package.json") as { version: string };
    const supabase = read("../../../node_modules/@supabase/supabase-js/package.json") as { version: string };
    expect(shared.imports.zod).toBe(`npm:zod@${zod.version}`);
    expect(shared.imports["@supabase/supabase-js"]).toBe(`npm:@supabase/supabase-js@${supabase.version}`);
  });
});

// send-invites renders 0.8 with React Email, so its import map adds React and the React Email parts on
// top of the shared three. They must pin the versions the functions-unit tests render with.
describe("send-invites/deno.json", () => {
  const shared = read("../deno.json") as { imports: Record<string, string> };
  const own = read("../send-invites/deno.json") as {
    imports: Record<string, string>;
    compilerOptions: Record<string, string>;
  };
  const extra = Object.entries(own.imports).filter(([name]) => !(name in shared.imports));

  it("keeps the shared imports and compiles JSX with React", () => {
    for (const [name, specifier] of Object.entries(shared.imports)) expect(own.imports[name]).toBe(specifier);
    expect(own.compilerOptions).toEqual({ jsx: "react-jsx", jsxImportSource: "react" });
  });

  it("pins React and each React Email part to the version installed in the workspace", () => {
    expect(extra.length).toBeGreaterThan(10);
    for (const [name, specifier] of extra) {
      const pkg = name.replace(/\/$/, "");
      const { version } = read(`../../../node_modules/${pkg}/package.json`) as { version: string };
      expect(specifier).toBe(name.endsWith("/") ? `npm:/${pkg}@${version}/` : `npm:${pkg}@${version}`);
    }
  });
});
