import { describe, expect, it } from "vitest";
import { colourLiteralsGuard } from "./colour-literals.ts";
import { globToRegExp, maskComments, position } from "./guard.ts";
import { mediaRecorderGuard } from "./media-recorder.ts";
import { isAllowedBucket, isFramesBucket, storageBucketsGuard } from "./storage-buckets.ts";

const API = ["Media", "Recorder"].join("");

describe("no-media-recorder", () => {
  it("flags the API in code, comments included, and nowhere in docs", () => {
    expect(mediaRecorderGuard.applies("apps/desktop/src/renderer/camera.ts")).toBe(true);
    expect(mediaRecorderGuard.applies("packages/detection/src/worker.ts")).toBe(true);
    expect(mediaRecorderGuard.applies("docs/phase-0-plan.md")).toBe(false);
    expect(mediaRecorderGuard.applies("CLAUDE.md")).toBe(false);
    const found = mediaRecorderGuard.check("a.ts", `const ok = 1;\n// keep ${API} out\nnew ${API}(stream);`);
    expect(found.map((v) => [v.line, v.column])).toEqual([
      [2, 9],
      [3, 5],
    ]);
    expect(mediaRecorderGuard.check("a.ts", `const x = "${API}Like";`)).toEqual([]);
  });
});

describe("no-colour-or-size-literals", () => {
  const check = (text: string) => colourLiteralsGuard.check("apps/web/src/x.tsx", text).map((v) => v.message);

  it("reads component files, not galleries, art, tests or plain .ts", () => {
    expect(colourLiteralsGuard.applies("apps/web/src/features/wall/tile.tsx")).toBe(true);
    expect(colourLiteralsGuard.applies("packages/ui/src/controls/button.tsx")).toBe(true);
    expect(colourLiteralsGuard.applies("packages/ui/src/controls/controls.gallery.tsx")).toBe(false);
    expect(colourLiteralsGuard.applies("packages/ui/src/gallery.tsx")).toBe(false);
    expect(colourLiteralsGuard.applies("packages/ui/gallery/main.tsx")).toBe(false);
    expect(colourLiteralsGuard.applies("packages/ui/src/art/mascot.tsx")).toBe(false);
    expect(colourLiteralsGuard.applies("apps/web/src/app/smoke.test.tsx")).toBe(false);
    expect(colourLiteralsGuard.applies("apps/desktop/src/main/window.ts")).toBe(false);
    expect(colourLiteralsGuard.applies("packages/tokens/src/index.ts")).toBe(false);
  });

  it("flags hex, colour functions, px, arbitrary rem and numeric inline sizes", () => {
    expect(check(`<div className="bg-[#121310]" />`)).toHaveLength(1);
    expect(check(`const c = "#fff";`)).toHaveLength(1);
    expect(check(`<div style={{ color: "rgba(0, 0, 0, 0.5)" }} />`)).toHaveLength(1);
    expect(check(`<div className="w-[12px] h-[0.5px]" />`)).toHaveLength(2);
    expect(check(`<div className="w-[3.5rem]" />`)).toHaveLength(1);
    expect(check(`<div style={{ width: 120, opacity: 0.5 }} />`)).toHaveLength(1);
  });

  it("lets token classes, comments, anchors and image loading hints through", () => {
    expect(check(`<div className="bg-surface text-fg-primary p-5 rounded-card w-160 type-h2" />`)).toEqual(
      [],
    );
    expect(check(`// Figma draws #121310 at 24px\n/* rgb(1, 2, 3) */\nconst a = 1;`)).toEqual([]);
    expect(check(`<a href="#main-content">x</a>`)).toEqual([]);
    expect(check(`<Image sizes="(min-width: 1280px) 640px, 40vw" fill />`)).toEqual([]);
    expect(check(`<source media="(min-width: 768px)" />`)).toEqual([]);
    expect(check(`<div style={{ width: \`\${percent}%\` }} />`)).toEqual([]);
    expect(check(`const url = "https://example.org/a"; // 12px`)).toEqual([]);
  });
});

describe("frames-bucket-only", () => {
  const check = (path: string, text: string) => storageBucketsGuard.check(path, text);

  it("accepts the frames bucket in every spelling the code uses", () => {
    expect(isFramesBucket(`"frames"`)).toBe(true);
    expect(isFramesBucket("FRAMES_BUCKET")).toBe(true);
    expect(isFramesBucket("contracts.FRAMES_BUCKET")).toBe(true);
    expect(check("a.ts", `admin.storage\n  .from("frames")\n  .upload(p, b);`)).toEqual([]);
    expect(check("a.ts", `ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).createSignedUploadUrl(p)`)).toEqual(
      [],
    );
    expect(check("a.ts", `await admin.from("events").delete();`)).toEqual([]);
  });

  it("flags another bucket, a bucket variable, a new bucket and a raw upload URL", () => {
    expect(check("a.ts", `supabase.storage.from("avatars").upload(p, b)`)).toHaveLength(1);
    expect(check("a.ts", `supabase.storage.from(bucket).upload(p, b)`)).toHaveLength(1);
    expect(check("a.ts", `admin.storage.createBucket("videos", { public: true })`)).toHaveLength(1);
    // Source text with template literals, written with #{ so this test file holds no "${" in a string.
    const source = (text: string) => text.replaceAll("#{", "${");
    expect(
      check("a.ts", source("fetch(`#{url}/storage/v1/object/recordings/#{path}`, { method: 'PUT' })")),
    ).toHaveLength(1);
    expect(check("a.ts", source("fetch(`#{url}/storage/v1/object/upload/sign/frames/#{path}`)"))).toEqual([]);
    expect(check("a.ts", source("fetch(`#{url}/storage/v1/object/list/frames`)"))).toEqual([]);
    expect(isFramesBucket(source("`#{FRAMES_BUCKET}`"))).toBe(true);
  });

  it("reads migrations and config.toml for other buckets", () => {
    expect(storageBucketsGuard.applies("supabase/migrations/20261007115936_storage.sql")).toBe(true);
    expect(storageBucketsGuard.applies("supabase/config.toml")).toBe(true);
    expect(
      check(
        "x.sql",
        "insert into storage.buckets (id, name) values ('frames', 'frames') on conflict do nothing;",
      ),
    ).toEqual([]);
    expect(
      check("x.sql", "insert into storage.buckets (id, name)\nvalues ('videos', 'videos');"),
    ).toHaveLength(1);
    expect(check("supabase/config.toml", "[storage.buckets.frames]\npublic = false\n")).toEqual([]);
    expect(check("supabase/config.toml", "[storage.buckets.avatars]\npublic = true\n")).toHaveLength(1);
  });

  it("allows Phase 1's private exports bucket for copy requests, and nothing else", () => {
    expect(isAllowedBucket(`"exports"`)).toBe(true);
    expect(isAllowedBucket("contracts.EXPORTS_BUCKET")).toBe(true);
    expect(isFramesBucket(`"exports"`)).toBe(false);
    expect(check("a.ts", `admin.storage.from(EXPORTS_BUCKET).upload(path, json)`)).toEqual([]);
    expect(check("a.ts", `admin.storage.from("export").upload(path, json)`)).toHaveLength(1);
    expect(
      check("x.sql", "insert into storage.buckets (id, name, public)\nvalues ('exports', 'exports', false);"),
    ).toEqual([]);
    expect(check("supabase/config.toml", "[storage.buckets.exports]\npublic = false\n")).toEqual([]);
  });
});

describe("helpers", () => {
  it("masks comments but keeps strings, lines and columns", () => {
    const text = `const a = "http://x"; // note #fff\n/* rgb(\n */ const b = 2;`;
    const masked = maskComments(text);
    expect(masked).toContain(`"http://x"`);
    expect(masked).not.toContain("#fff");
    expect(masked).not.toContain("rgb(");
    expect(masked.length).toBe(text.length);
    expect(masked.split("\n")).toHaveLength(3);
  });

  it("finds 1-based positions and matches globs", () => {
    expect(position("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
    expect(globToRegExp("apps/*/src/**/*.tsx").test("apps/web/src/app/page.tsx")).toBe(true);
    expect(globToRegExp("apps/*/src/**/*.tsx").test("apps/web/src/a/b/c.tsx")).toBe(true);
    expect(globToRegExp("apps/*/src/**/*.tsx").test("apps/web/lib/c.tsx")).toBe(false);
    expect(globToRegExp("**/gallery/**").test("packages/ui/gallery/main.tsx")).toBe(true);
  });
});
