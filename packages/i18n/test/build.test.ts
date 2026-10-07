import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateAll } from "../scripts/build.ts";
import { buildMessages, type Catalog, type CatalogEntry, COUNT_MESSAGES } from "../scripts/lib/catalog.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const catalog = JSON.parse(readFileSync(join(ROOT, "catalog.json"), "utf8")) as Catalog;

function withEntry(key: string, change: (entry: CatalogEntry) => void): Catalog {
  const copy = structuredClone(catalog);
  const entry = copy.keys.find((e) => e.key === key);
  if (!entry) throw new Error(`no ${key}`);
  change(entry);
  return copy;
}

function problemsOf(input: unknown, dashboard: unknown = {}): readonly string[] {
  return buildMessages(input, dashboard).problems;
}

describe("i18n build on the shipped catalog", () => {
  const result = buildMessages(catalog, {});

  it("passes with no problems", () => {
    expect(result.problems).toEqual([]);
    expect(result.messages).not.toBeNull();
    expect(result.counts.catalog).toBe(225);
  });

  it("matches the committed messages files, so the build is deterministic and up to date", () => {
    const { files, problems } = generateAll();
    expect(problems).toEqual([]);
    expect(files).not.toBeNull();
    for (const [path, content] of Object.entries(files ?? {})) {
      expect(readFileSync(join(ROOT, path), "utf8"), `${path} is stale: run pnpm i18n:build`).toBe(content);
    }
    expect(generateAll()).toEqual(generateAll());
  });

  it("applies the five renames", () => {
    const en = result.messages?.en as Record<string, Record<string, unknown>>;
    expect(en.app?.title).toMatchObject({ default: "Üki · {course} · {examType}" });
    expect(en.event?.phone).toMatchObject({ title: "Phone in frame" });
    expect(en.done?.submitted).toMatchObject({ label: "Submitted" });
    expect(en.done?.time_used).toMatchObject({ label: "Time used" });
    expect(en.done?.flags).toMatchObject({ label: "Flags" });
    expect(Object.keys(catalog.renames)).toHaveLength(5);
  });

  it("names the plan's eight count messages", () => {
    expect(Object.keys(COUNT_MESSAGES).sort()).toEqual(
      [
        "check.preview.status",
        "exam.camera.faces",
        "identity.help.body",
        "rules.eyes.body",
        "event.browser_locked",
        "done.flags.value",
        "ended.answered.value",
        "lock.done.body",
      ].sort(),
    );
  });
});

describe("i18n build fails on a bad catalog", () => {
  it("reports a missing language", () => {
    const bad = withEntry("join.title", (e) => {
      delete e.kk;
    });
    expect(problemsOf(bad)).toEqual(["join.title [kk]: missing"]);
  });

  it("reports an empty message", () => {
    const bad = withEntry("join.title", (e) => {
      e.ru = "  ";
    });
    expect(problemsOf(bad)).toEqual(["join.title [ru]: empty"]);
  });

  it("reports an emoji", () => {
    const bad = withEntry("done.title", (e) => {
      e.en = "Submitted \u{1F389}";
    });
    expect(problemsOf(bad)).toEqual(["done.title [en]: no emoji in product copy: Submitted \u{1F389}"]);
  });

  it("reports a placeholder mismatch", () => {
    const bad = withEntry("exam.counter", (e) => {
      e.ru = "Вопрос {n} из {count}";
    });
    expect(problemsOf(bad)).toEqual([
      "exam.counter: arguments differ, en has {n, total} and ru has {count, n}",
    ]);
  });

  it("reports an ICU parse error", () => {
    const bad = withEntry("exam.counter", (e) => {
      e.en = "Question {n of {total}";
    });
    const problems = problemsOf(bad);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^exam\.counter \[en\]: does not parse as ICU/);
  });

  it("reports a plural without other, and a plural arm the language does not have", () => {
    const noOther = withEntry("exam.camera.faces", (e) => {
      e.en = "{count, plural, one {# face}}";
    });
    expect(problemsOf(noOther)[0]).toMatch(/^exam\.camera\.faces \[en\]: does not parse as ICU/);
    const wrongArm = withEntry("exam.camera.faces", (e) => {
      e.en = "{count, plural, one {# face} few {# faces} other {# faces}}";
    });
    expect(problemsOf(wrongArm)).toEqual([
      'exam.camera.faces [en]: plural arm "few" of {count} is not one of the en categories (one, other)',
    ]);
  });

  it("reports a count message without a plural block in en or ru, but lets kk omit it", () => {
    const bad = withEntry("event.browser_locked", (e) => {
      e.ru = "Браузер заблокирован · закрыто вкладок: {count}";
    });
    expect(problemsOf(bad)).toEqual([
      "event.browser_locked [ru]: depends on a count but has no {n, plural, ...} block",
    ]);
    const kkPlain = withEntry("done.flags.value", (e) => {
      e.kk = "{count} · адам қарап шығады";
    });
    expect(problemsOf(kkPlain)).toEqual([]);
  });

  it("reports a nested-key collision", () => {
    const bad = structuredClone(catalog);
    bad.renames = {};
    const problems = problemsOf(bad);
    expect(problems).toContain("app.title.locked: nested-key collision, app.title is already a message");
    expect(problems).toContain("event.phone.detail: nested-key collision, event.phone is already a message");
  });

  it("reports a duplicate key and a rename of a key that does not exist", () => {
    const bad = structuredClone(catalog);
    const first = bad.keys[0] as CatalogEntry;
    bad.keys.push({ ...first });
    bad.renames["no.such.key"] = "no.such.key.label";
    const problems = problemsOf(bad);
    expect(problems).toContain("app.title: duplicate key in catalog.json");
    expect(problems).toContain("renames: no.such.key is not a catalog key");
  });

  it("reports a schema problem instead of throwing", () => {
    expect(problemsOf({ keys: "nope" })[0]).toMatch(/^catalog\.json: /);
  });
});

describe("dashboard.json", () => {
  it("merges dashboard.* keys into English only", () => {
    const result = buildMessages(catalog, {
      "dashboard.live.title": "Live wall",
      "dashboard.live.flags": "{count, plural, one {# flag} other {# flags}}",
    });
    expect(result.problems).toEqual([]);
    expect(result.messages?.en.dashboard).toEqual({
      live: { flags: "{count, plural, one {# flag} other {# flags}}", title: "Live wall" },
    });
    expect(result.messages?.kk.dashboard).toBeUndefined();
    expect(result.messages?.ru.dashboard).toBeUndefined();
  });

  it("checks dashboard messages like catalog messages", () => {
    expect(
      problemsOf(catalog, { "dashboard.a": "", "live.title": "Live wall", "dashboard.b": "{x" }),
    ).toEqual([
      "dashboard.json: dashboard.a [en]: empty",
      'dashboard.json: live.title: keys must start with "dashboard." and use [a-z0-9][a-zA-Z0-9_]* segments',
      expect.stringMatching(/^dashboard\.json: dashboard\.b \[en\]: does not parse as ICU/),
    ]);
  });
});
