/**
 * CSV for the strings review sheet (scripts/export.ts, scripts/import.ts). Writing: UTF-8 with a byte
 * order mark, so Excel and Numbers read the Cyrillic and Kazakh letters as UTF-8; every cell quoted;
 * LF line endings (.gitattributes keeps text files LF). Reading takes what Excel, Numbers and Google
 * Sheets save: with or without the byte order mark, CRLF or LF, and a comma, semicolon or tab
 * between cells (Excel uses a semicolon where the decimal separator is a comma, as in Russian).
 */

export const BOM = "﻿";

function quote(cell: string): string {
  return `"${cell.replaceAll('"', '""')}"`;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${BOM}${rows.map((row) => row.map(quote).join(",")).join("\n")}\n`;
}

export class CsvError extends Error {}

/** The cell separator: whichever of comma, semicolon and tab the first line uses most, outside quotes. */
export function sniffDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) counts[ch] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

/**
 * RFC 4180 rows. A quote opens a quoted cell only at the start of a cell; inside one, two quotes are
 * a quote, and line breaks belong to the cell (read as LF). Throws CsvError on a quote left open.
 */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(BOM.length) : input;
  const delimiter = sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellStarted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else if (ch === "\r") {
        cell += "\n";
        if (text[i + 1] === "\n") i += 1;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
      cellStarted = false;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      cellStarted = false;
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      cell += ch;
      cellStarted = true;
    }
  }
  if (inQuotes) throw new CsvError(`a quoted cell is never closed (row ${rows.length + 1})`);
  if (cellStarted || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
