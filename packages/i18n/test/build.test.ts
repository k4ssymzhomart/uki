import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dashboardFiles, generateAll, mergeDashboard } from "../scripts/build.ts";
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
    expect(result.counts.catalog).toBe(254);
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

  it("applies the six renames", () => {
    const en = result.messages?.en as Record<string, Record<string, unknown>>;
    expect(en.app?.title).toMatchObject({ default: "Üki · {course} · {examType}" });
    expect(en.event?.phone).toMatchObject({ title: "Phone in frame" });
    expect(en.done?.submitted).toMatchObject({ label: "Submitted" });
    expect(en.done?.time_used).toMatchObject({ label: "Time used" });
    expect(en.done?.flags).toMatchObject({ label: "Flags" });
    // The plan's five, and the 1.4a FAQ question next to its answer.
    expect(en.rules?.faq).toMatchObject({ video: { question: "Where is the video?" } });
    expect(Object.keys(catalog.renames)).toHaveLength(6);
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

describe("dashboard*.json", () => {
  const entry = (en: string | undefined, ru: string | undefined) => ({
    ...(en === undefined ? {} : { en }),
    ...(ru === undefined ? {} : { ru }),
  });

  it("merges dashboard.* keys into English and Russian, not Kazakh", () => {
    const result = buildMessages(catalog, {
      "dashboard.live.title": entry("Live wall", "Экран наблюдения"),
      "dashboard.live.flags": entry(
        "{count, plural, one {# flag} other {# flags}}",
        "{count, plural, one {# отметка} few {# отметки} many {# отметок} other {# отметки}}",
      ),
    });
    expect(result.problems).toEqual([]);
    expect(result.messages?.en.dashboard).toEqual({
      live: { flags: "{count, plural, one {# flag} other {# flags}}", title: "Live wall" },
    });
    expect(result.messages?.ru.dashboard).toEqual({
      live: {
        flags: "{count, plural, one {# отметка} few {# отметки} many {# отметок} other {# отметки}}",
        title: "Экран наблюдения",
      },
    });
    expect(result.messages?.kk.dashboard).toBeUndefined();
  });

  it("fails on a missing or empty Russian or English message", () => {
    expect(
      problemsOf(catalog, {
        "dashboard.a": entry("Live wall", undefined),
        "dashboard.b": entry("Live wall", " "),
        "dashboard.c": entry(undefined, "Экран наблюдения"),
        "dashboard.d": entry("", "Экран наблюдения"),
      }),
    ).toEqual([
      "dashboard.json: dashboard.a [ru]: missing",
      "dashboard.json: dashboard.b [ru]: empty",
      "dashboard.json: dashboard.c [en]: missing",
      "dashboard.json: dashboard.d [en]: empty",
    ]);
  });

  it("checks dashboard messages like catalog messages, in both languages", () => {
    expect(
      problemsOf(catalog, {
        "live.title": entry("Live wall", "Экран наблюдения"),
        "dashboard.b": entry("{x", "{x}"),
        "dashboard.c": entry("Wall", "Экран {x"),
        "dashboard.d": entry("{n} left", "осталось {count}"),
        "dashboard.e": entry("{n, plural, one {# flag} other {# flags}}", "{n, plural, two {#} other {#}}"),
      }),
    ).toEqual([
      'dashboard.json: live.title: keys must start with "dashboard." and use [a-z0-9][a-zA-Z0-9_]* segments',
      expect.stringMatching(/^dashboard\.json: dashboard\.b \[en\]: does not parse as ICU/),
      expect.stringMatching(/^dashboard\.json: dashboard\.c \[ru\]: does not parse as ICU/),
      "dashboard.json: dashboard.d: arguments differ, en has {n} and ru has {count}",
      'dashboard.json: dashboard.e [ru]: plural arm "two" of {n} is not one of the ru categories (one, few, many, other)',
    ]);
  });

  it("refuses the Phase 0 format, a plain English string, and unknown fields", () => {
    expect(problemsOf(catalog, { "dashboard.a": "Live wall" })[0]).toMatch(
      /^dashboard\.json: dashboard\.a: /,
    );
    expect(problemsOf(catalog, { "dashboard.a": { en: "A", ru: "Б", kk: "В" } })[0]).toMatch(
      /^dashboard\.json: dashboard\.a: /,
    );
  });

  it("names the file a problem comes from", () => {
    expect(
      buildMessages(
        catalog,
        { "dashboard.wall.x": entry("X", undefined) },
        { "dashboard.wall.x": "dashboard-wall.json" },
      ).problems,
    ).toEqual(["dashboard-wall.json: dashboard.wall.x [ru]: missing"]);
  });

  it("merges the files, skips each file's $comment, and refuses a key two files define", () => {
    const merged = mergeDashboard([
      { file: "dashboard.json", data: { $comment: "first pass", "dashboard.a": entry("A", "А") } },
      {
        file: "dashboard-landing.json",
        data: { "dashboard.b": entry("B", "Б"), "dashboard.a": entry("A", "А") },
      },
      { file: "dashboard-x.json", data: { $comment: 1 } },
      { file: "dashboard-y.json", data: ["nope"] },
    ]);
    expect(merged.merged).toEqual({ "dashboard.a": entry("A", "А"), "dashboard.b": entry("B", "Б") });
    expect(merged.sources).toEqual({
      "dashboard.a": "dashboard.json",
      "dashboard.b": "dashboard-landing.json",
    });
    expect(merged.problems).toEqual([
      "dashboard-landing.json: dashboard.a: duplicate key, already in dashboard.json",
      "dashboard-x.json: $comment: must be a string",
      'dashboard-y.json: must be an object of dashboard.* keys to { "en": "...", "ru": "..." }',
    ]);
  });

  it("ships every dashboard key in English and Russian, each file marked for the P.18 read-through", () => {
    const files = dashboardFiles();
    expect(files).toEqual(expect.arrayContaining(["dashboard-wall.json", "dashboard.json"]));
    for (const file of ["dashboard.json", "dashboard-wall.json"]) {
      const data = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as Record<string, unknown>;
      expect(data.$comment, file).toMatch(/native review needed, P\.18/);
    }
    const en = JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8")) as { dashboard: object };
    const ru = JSON.parse(readFileSync(join(ROOT, "messages/ru.json"), "utf8")) as { dashboard: object };
    const leaves = (node: object, prefix = ""): string[] =>
      Object.entries(node).flatMap(([key, value]) =>
        typeof value === "string" ? [`${prefix}${key}`] : leaves(value as object, `${prefix}${key}.`),
      );
    expect(leaves(ru.dashboard)).toEqual(leaves(en.dashboard));
    expect(leaves(en.dashboard).length).toBeGreaterThan(280);
  });
});
