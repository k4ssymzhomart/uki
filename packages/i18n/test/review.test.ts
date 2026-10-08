import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardFiles } from "../scripts/build.ts";
import { runImport } from "../scripts/import.ts";
import { BOM, CsvError, parseCsv, toCsv } from "../scripts/lib/csv.ts";
import {
  catalogWhere,
  exportReview,
  FULL_HEADER,
  importReview,
  KAZAKH_HEADER,
  readSources,
  type SourceFiles,
  WHERE,
} from "../scripts/lib/review.ts";
import { columnName, xlsx } from "../scripts/lib/xlsx.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const sources = readSources(ROOT);
const review = exportReview(sources);

/** The parsed full sheet, edited by `edit(rows)`, back to CSV. */
function editedFull(edit: (rows: string[][]) => void): string {
  const rows = parseCsv(review.full);
  edit(rows);
  return toCsv(rows);
}

function setCell(rows: string[][], key: string, column: string, value: string): void {
  const header = rows[0] as string[];
  const row = rows.find((r) => r[0] === key);
  if (!row) throw new Error(`no row ${key}`);
  row[header.indexOf(column)] = value;
}

function cellOf(rows: string[][], key: string, column: string): string {
  const header = rows[0] as string[];
  return rows.find((r) => r[0] === key)?.[header.indexOf(column)] ?? "";
}

describe("csv", () => {
  it("round-trips quotes, separators and line breaks, with a byte order mark", () => {
    const rows = [
      ["key", "text"],
      ["a", 'He said "hi", then left'],
      ["b", "two\nlines; and a tab\there"],
      ["c", ""],
    ];
    const csv = toCsv(rows);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("reads Excel's semicolons, CRLF and no byte order mark", () => {
    expect(parseCsv('key;ru\r\na;"x;y"\r\nb;z\r\n')).toEqual([
      ["key", "ru"],
      ["a", "x;y"],
      ["b", "z"],
    ]);
    expect(parseCsv("key\tru\na\tb")).toEqual([
      ["key", "ru"],
      ["a", "b"],
    ]);
  });

  it("refuses a quote that is never closed", () => {
    expect(() => parseCsv('key,ru\na,"open')).toThrow(CsvError);
  });
});

describe("pnpm i18n:export", () => {
  const catalog = sources.catalog as { keys: { key: string }[] };
  const dashboardCount = sources.dashboard.reduce(
    (sum, { data }) => sum + Object.keys(data as object).filter((k) => k !== "$comment").length,
    0,
  );

  it("has one row per message of catalog.json and of every dashboard file", () => {
    expect(sources.dashboard.map((d) => d.file)).toEqual(dashboardFiles(ROOT));
    expect(review.rows).toHaveLength(catalog.keys.length + dashboardCount);
    expect(new Set(review.rows.map((r) => r.key)).size).toBe(review.rows.length);
  });

  it("writes UTF-8 with a byte order mark and the header key | where | en | ru | kk | source | notes", () => {
    expect(review.full.startsWith(`${BOM}"key","where","en","ru","kk","source","notes"\n`)).toBe(true);
    const rows = parseCsv(review.full);
    expect(rows[0]).toEqual([...FULL_HEADER]);
    expect(rows).toHaveLength(review.rows.length + 1);
    expect(cellOf(rows, "join.title", "kk")).toBe(
      (sources.catalog as { keys: { key: string; kk: string }[] }).keys.find((k) => k.key === "join.title")
        ?.kk,
    );
  });

  it("sorts by where, then key", () => {
    const order = review.rows.map((r) => [WHERE.indexOf(r.where), r.key] as const);
    const sorted = [...order].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    expect(order).toEqual(sorted);
    expect([...new Set(review.rows.map((r) => r.where))]).toEqual([...WHERE]);
  });

  it("says where each string shows", () => {
    const where = (key: string) => review.rows.find((r) => r.key === key)?.where;
    expect(where("join.title")).toBe("student app");
    expect(where("pair.card.title")).toBe("student app");
    expect(where("tray.open")).toBe("student app");
    expect(where("lock.badge")).toBe("Üki Lock");
    expect(where("os.macos")).toBe("Üki Lock");
    expect(where("email.invite.subject")).toBe("email");
    expect(where("dashboard.wall.title")).toBe("dashboard");
    expect(where("dashboard.landing.pilot.form.email")).toBe("landing");
    expect(catalogWhere("lock.calc.clear")).toBe("Üki Lock");
  });

  it("keeps the catalog's source and group, and names the dashboard file", () => {
    const appTitle = review.rows.find((r) => r.key === "app.title");
    expect(appTitle?.source).toBe("figma");
    expect(appTitle?.notes).toMatch(/^Shared: /);
    expect(appTitle?.notes).toContain("app.title.default");
    const wall = review.rows.find((r) => r.key === "dashboard.wall.title");
    expect(wall).toMatchObject({ source: "", kk: "", notes: "dashboard-wall.json" });
  });

  it("puts only the rows with Kazakh in the Kazakh sheet, kk before ru", () => {
    const rows = parseCsv(review.kazakh);
    expect(rows[0]).toEqual([...KAZAKH_HEADER]);
    expect(rows).toHaveLength(catalog.keys.length + 1);
    expect(rows.slice(1).every((r) => r[3] !== "")).toBe(true);
    expect(rows.some((r) => (r[0] ?? "").startsWith("dashboard."))).toBe(false);
  });

  it("is deterministic", () => {
    const again = exportReview(readSources(ROOT));
    expect(again.full).toBe(review.full);
    expect(again.kazakh).toBe(review.kazakh);
    expect(xlsx(again.sheets).equals(xlsx(review.sheets))).toBe(true);
  });
});

/** The entries of a zip, checked against their CRC. */
function unzip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extra = buffer.readUInt16LE(at + 30);
    const comment = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = inflateRawSync(buffer.subarray(start, start + size));
    expect(crc32(data), name).toBe(buffer.readUInt32LE(at + 16));
    files.set(name, data.toString("utf8"));
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

describe("strings-review.xlsx", () => {
  const parts = unzip(xlsx(review.sheets));

  it("is a workbook with the two review sheets", () => {
    expect([...parts.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/sharedStrings.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(parts.get("xl/workbook.xml")).toContain('<sheet name="Russian review" sheetId="1" r:id="rId1"/>');
    expect(parts.get("xl/workbook.xml")).toContain('<sheet name="Kazakh review" sheetId="2" r:id="rId2"/>');
  });

  it("freezes and filters the header row and wraps text", () => {
    for (const sheet of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
      expect(parts.get(sheet)).toContain(
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
      );
      expect(parts.get(sheet)).toMatch(/<autoFilter ref="A1:[FG]\d+"\/>/);
    }
    expect(parts.get("xl/worksheets/sheet1.xml")).toContain(
      `<dimension ref="A1:G${review.rows.length + 1}"/>`,
    );
    expect(parts.get("xl/styles.xml")).toContain('<alignment vertical="top" wrapText="1"/>');
  });

  it("holds every string, escaped", () => {
    const shared = parts.get("xl/sharedStrings.xml") ?? "";
    const ru = review.rows.find((r) => r.key === "dashboard.wall.extend.option")?.ru ?? "";
    expect(ru).toMatch(/^\+\{minutes\}/);
    expect(shared).toContain(`<t xml:space="preserve">${ru}</t>`);
    expect(shared).toContain("&lt;");
  });

  it("names columns past Z", () => {
    expect([0, 6, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "G", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});

describe("pnpm i18n:import", () => {
  it("changes nothing for an unedited export, either sheet", () => {
    for (const csv of [review.full, review.kazakh]) {
      const result = importReview(csv, sources);
      expect(result.problems).toEqual([]);
      expect(result.changes).toEqual([]);
      expect(result.files).toEqual({});
    }
  });

  it("applies only the edited Russian and Kazakh cells, in the files they belong to", () => {
    const csv = editedFull((rows) => {
      setCell(rows, "join.title", "ru", "Войдите в экзамен");
      setCell(rows, "join.title", "kk", "Емтиханға кіріңіз");
      setCell(rows, "dashboard.wall.title", "ru", "Живая стена");
    });
    const result = importReview(csv, sources);
    expect(result.problems).toEqual([]);
    expect(result.changes.map((c) => [c.key, c.language, c.file, c.to])).toEqual([
      ["join.title", "ru", "catalog.json", "Войдите в экзамен"],
      ["join.title", "kk", "catalog.json", "Емтиханға кіріңіз"],
      ["dashboard.wall.title", "ru", "dashboard-wall.json", "Живая стена"],
    ]);
    expect(Object.keys(result.files).sort()).toEqual(["catalog.json", "dashboard-wall.json"]);
    const diff = (file: string) => {
      const before = readFileSync(join(ROOT, file), "utf8").split("\n");
      const after = (result.files[file] ?? "").split("\n");
      expect(after).toHaveLength(before.length);
      return after.filter((line, i) => line !== before[i]);
    };
    expect(diff("dashboard-wall.json")).toEqual(['    "ru": "Живая стена"']);
    expect(diff("catalog.json")).toEqual([
      '      "kk": "Емтиханға кіріңіз",',
      '      "ru": "Войдите в экзамен",',
    ]);
  });

  it("takes the Kazakh sheet's kk and ru columns", () => {
    const rows = parseCsv(review.kazakh);
    setCell(rows, "done.title", "kk", "Жауаптар тапсырылды");
    const result = importReview(toCsv(rows), sources);
    expect(result.problems).toEqual([]);
    expect(result.changes).toMatchObject([{ key: "done.title", language: "kk", to: "Жауаптар тапсырылды" }]);
  });

  it("refuses a broken placeholder, through the build's checks, and writes nothing", () => {
    const dashboard = importReview(
      editedFull((rows) => setCell(rows, "dashboard.wall.extend.option", "ru", "+{minuty} мин")),
      sources,
    );
    expect(dashboard.files).toEqual({});
    expect(dashboard.changes).toEqual([]);
    expect(dashboard.problems).toEqual([
      "the edited strings fail the i18n build: dashboard-wall.json: dashboard.wall.extend.option: arguments differ, en has {minutes} and ru has {minuty}",
    ]);

    const kazakh = importReview(
      editedFull((rows) => setCell(rows, "exam.saved", "kk", "Сақталды")),
      sources,
    );
    expect(kazakh.problems).toEqual([
      "the edited strings fail the i18n build: exam.saved: arguments differ, en has {time} and kk has {}",
    ]);
  });

  it("refuses a broken plural, ICU syntax and an emptied cell", () => {
    const problems = (key: string, column: string, value: string) =>
      importReview(
        editedFull((rows) => setCell(rows, key, column, value)),
        sources,
      ).problems.join("\n");
    expect(problems("done.flags.value", "ru", "{count, plural, one {# отметка} other {# отметки}")).toMatch(
      /does not parse as ICU/,
    );
    expect(
      problems("done.flags.value", "ru", "{count, plural, one {# отметка} dual {#} other {# отметки}}"),
    ).toMatch(/plural arm "dual"/);
    expect(problems("join.title", "ru", "")).toMatch(/join\.title \[ru\]: empty/);
  });

  it("refuses unknown and repeated keys, short rows, and Kazakh on a dashboard row", () => {
    const rows = parseCsv(review.full);
    const header = rows[0] as string[];
    const first = rows[1] as string[];
    const unknown = [...first];
    unknown[0] = "join.titel";
    expect(importReview(toCsv([header, unknown]), sources).problems).toEqual([
      "row 2: join.titel is not a key of catalog.json or of any dashboard*.json",
    ]);
    expect(importReview(toCsv([header, first, first]), sources).problems).toEqual([
      `row 3: ${first[0]} appears twice`,
    ]);
    expect(importReview(toCsv([header, first.slice(0, 3)]), sources).problems).toEqual([
      "row 2: 3 cells, the header has 7",
    ]);
    const kk = editedFull((r) => setCell(r, "dashboard.wall.title", "kk", "Тікелей"));
    expect(importReview(kk, sources).problems).toEqual([
      `row ${parseCsv(kk).findIndex((r) => r[0] === "dashboard.wall.title") + 1}: dashboard.wall.title is a dashboard-wall.json string, which has no Kazakh`,
    ]);
    expect(importReview("en,notes\na,b\n", sources).problems).toEqual([
      'the header has no "key" column',
      'the header has neither a "ru" nor a "kk" column',
    ]);
  });

  it("reads a sheet saved by Excel with semicolons and CRLF, and never imports English", () => {
    const rows = parseCsv(review.full);
    setCell(rows, "join.title", "ru", "Вход; экзамен");
    setCell(rows, "join.title", "en", "Join, now");
    const csv = rows
      .map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(";"))
      .join("\r\n");
    const result = importReview(csv, sources);
    expect(result.problems).toEqual([]);
    expect(result.changes).toMatchObject([{ key: "join.title", language: "ru", to: "Вход; экзамен" }]);
    expect(result.notices[0]).toMatch(
      /English is not imported; 1 English cell differs from the files.*join\.title/,
    );
  });
});

describe("runImport on a copy of the package", () => {
  let dir: string;
  let copy: SourceFiles;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "uki-i18n-import-"));
    for (const file of ["catalog.json", ...dashboardFiles(ROOT), "messages"]) {
      cpSync(join(ROOT, file), join(dir, file), { recursive: true });
    }
    copy = readSources(dir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes the edited cells and rebuilds the messages", () => {
    const rows = parseCsv(exportReview(copy).full);
    setCell(rows, "dashboard.wall.title", "ru", "Живая стена");
    writeFileSync(join(dir, "edited.csv"), toCsv(rows));
    expect(runImport(join(dir, "edited.csv"), { root: dir })).toBe(0);
    const wall = JSON.parse(readFileSync(join(dir, "dashboard-wall.json"), "utf8"));
    expect(wall["dashboard.wall.title"]).toEqual({ en: "Live wall", ru: "Живая стена" });
    const ru = JSON.parse(readFileSync(join(dir, "messages/ru.json"), "utf8"));
    expect(ru.dashboard.wall.title).toBe("Живая стена");
    expect(readFileSync(join(dir, "catalog.json"), "utf8")).toBe(
      readFileSync(join(ROOT, "catalog.json"), "utf8"),
    );
  });

  it("writes nothing for a refused sheet, or a dry run", () => {
    const before = readFileSync(join(dir, "dashboard-wall.json"), "utf8");
    const broken = parseCsv(exportReview(copy).full);
    setCell(broken, "dashboard.wall.extend.option", "ru", "+{minuty} мин");
    setCell(broken, "dashboard.wall.title", "ru", "Живая стена");
    writeFileSync(join(dir, "broken.csv"), toCsv(broken));
    expect(runImport(join(dir, "broken.csv"), { root: dir })).toBe(1);
    const fine = parseCsv(exportReview(copy).full);
    setCell(fine, "dashboard.wall.title", "ru", "Живая стена");
    writeFileSync(join(dir, "fine.csv"), toCsv(fine));
    expect(runImport(join(dir, "fine.csv"), { root: dir, dryRun: true })).toBe(0);
    expect(readFileSync(join(dir, "dashboard-wall.json"), "utf8")).toBe(before);
    expect(readFileSync(join(dir, "messages/ru.json"), "utf8")).toBe(
      readFileSync(join(ROOT, "messages/ru.json"), "utf8"),
    );
  });

  it("refuses a file that is not UTF-8", () => {
    writeFileSync(
      join(dir, "latin1.csv"),
      Buffer.from([0x6b, 0x65, 0x79, 0x2c, 0x72, 0x75, 0x0a, 0xe9, 0x0a]),
    );
    expect(runImport(join(dir, "latin1.csv"), { root: dir })).toBe(1);
  });
});
