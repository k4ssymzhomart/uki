// Every function carries its own deno.json (what `supabase functions deploy` bundles with); the one in
// supabase/functions is for editors and `functions serve`. They must pin the same versions, and those
// must match the workspace's lockfile versions the apps run.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FUNCTIONS = ["ingest", "frames", "command", "stills"] as const;
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
