// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  badRows,
  checkRosterCells,
  errorReportCsv,
  parseRosterCsv,
  problemKey,
  type RosterCells,
  replaceRow,
  skipRows,
} from "./roster-csv.ts";

const GROUPS = ["204", "101", "102", "103", "110", "301"];
const demo = readFileSync(new URL("../../../../../demo/roster.csv", import.meta.url), "utf8");

function rows(text: string): RosterCells[] {
  const parsed = parseRosterCsv(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.rows;
}

describe("parseRosterCsv", () => {
  it("maps a header in any order and any of its spellings", () => {
    const parsed = rows(
      "Email,Full name,Student ID,Group,Language\nmadina@kru.test,Madina Tulegenova,20231187,204,kk\n",
    );
    expect(parsed).toEqual([
      {
        student_number: "20231187",
        full_name: "Madina Tulegenova",
        email: "madina@kru.test",
        group: "204",
        locale: "kk",
      },
    ]);
  });

  it("reads Russian headers, a byte-order mark, quotes and blank lines", () => {
    const parsed = rows(
      `${String.fromCharCode(0xfeff)}ФИО;Номер;Почта;Группа;Язык\n"Тулегенова, Мадина";20231187;m@kru.test;204;рус\n\n`,
    );
    expect(parsed[0]).toMatchObject({
      full_name: "Тулегенова, Мадина",
      student_number: "20231187",
      locale: "рус",
    });
  });

  it("takes the plan's column order when there is no header", () => {
    expect(rows("20231187,Madina Tulegenova,m@kru.test,204,ru")[0]).toMatchObject({
      student_number: "20231187",
      locale: "ru",
    });
  });

  it("gives every student Kazakh when the file has no language column, as Figma's four columns", () => {
    const parsed = parseRosterCsv("name,student id,email,group\nMadina Tulegenova,20231187,m@kru.test,204\n");
    expect(parsed).toMatchObject({ ok: true, hasLocaleColumn: false });
    expect(parsed.ok && parsed.rows[0]?.locale).toBe("kk");
  });

  it("refuses an empty file, a header alone and more than 2,000 rows", () => {
    expect(parseRosterCsv("")).toEqual({ ok: false, reason: "empty" });
    expect(parseRosterCsv("student number,full name,email,group,language\n")).toEqual({
      ok: false,
      reason: "empty",
    });
    const many = `${"x,y,z,w,v\n".repeat(2001)}`;
    expect(parseRosterCsv(many)).toEqual({ ok: false, reason: "tooMany" });
  });
});

describe("the demo roster (demo/roster.csv)", () => {
  const parsed = rows(demo);
  const check = checkRosterCells(parsed, GROUPS);

  it("holds 24 students of group 204, six of them with the problems 0.3a shows", () => {
    expect(parsed).toHaveLength(24);
    expect(check.valid).toHaveLength(18);
    const bad = badRows(parsed, check.issues);
    expect(bad.map((row) => [row.row, row.name, problemKey(row.issues[0] as never)])).toEqual([
      [4, "Kamila Tursynova", "number_invalid"],
      [9, "Dana Zhaksylykova", "group_empty"],
      [10, "Dilnaz Yessenova", "group_unknown"],
      [14, "Aruzhan Kassymova", "email_no_at"],
      [17, "Erlan Kairatov", "number_duplicate"],
      [21, "", "name_empty"],
    ]);
  });

  it("is clean after the six fixes the demo makes, with 24 distinct students", () => {
    let fixed = replaceRow(parsed, 4, { student_number: "20235004" });
    fixed = replaceRow(fixed, 9, { group: "204" });
    fixed = replaceRow(fixed, 10, { group: "204" });
    fixed = replaceRow(fixed, 14, { email: "20231219@student.kru.test" });
    fixed = replaceRow(fixed, 17, { student_number: "20235017" });
    fixed = replaceRow(fixed, 21, { full_name: "Alikhan Utepov" });
    const after = checkRosterCells(fixed, GROUPS);
    expect(after.issues).toEqual([]);
    expect(after.valid).toHaveLength(24);
    expect(new Set(after.valid.map((row) => row.student_number)).size).toBe(24);
  });

  it("skipping the bad rows leaves the 18 good ones in file order", () => {
    const bad = badRows(parsed, check.issues).map((row) => row.row);
    const kept = skipRows(parsed, bad);
    expect(kept).toHaveLength(18);
    expect(checkRosterCells(kept, GROUPS).issues).toEqual([]);
    expect(kept[0]?.full_name).toBe("Kairat Kairatov");
  });
});

describe("problemKey", () => {
  it("tells an empty student number from a wrong one", () => {
    expect(problemKey({ row: 1, column: "student_number", problem: "number_invalid", value: "" })).toBe(
      "number_empty",
    );
    expect(problemKey({ row: 1, column: "student_number", problem: "number_invalid", value: "2023" })).toBe(
      "number_invalid",
    );
  });
});

describe("errorReportCsv", () => {
  it("writes one line per problem with the row's cells and the message", () => {
    const parsed = rows("20231187,Madina Tulegenova,no-at,999,kk");
    const check = checkRosterCells(parsed, GROUPS);
    const csv = errorReportCsv(parsed, check.issues, (issue) => `bad ${issue.column}`, [
      "row",
      "student_number",
      "full_name",
      "email",
      "group",
      "locale",
      "column",
      "problem",
    ]);
    expect(csv.split("\n")).toEqual([
      "row,student_number,full_name,email,group,locale,column,problem",
      "1,20231187,Madina Tulegenova,no-at,999,kk,email,bad email",
      "1,20231187,Madina Tulegenova,no-at,999,kk,group,bad group",
    ]);
  });
});
