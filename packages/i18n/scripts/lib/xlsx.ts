import { crc32, deflateRawSync } from "node:zlib";

/**
 * A minimal .xlsx writer for the strings review workbook (scripts/export.ts), with no dependency:
 * SpreadsheetML parts in a zip made with node:zlib. Every cell is a shared string in a text-formatted,
 * top-aligned, wrapped style, so Excel never reads "+{minutes} min" as a formula; the header row is
 * bold, frozen and filterable. The zip carries a fixed 1980-01-01 timestamp, so the same strings give
 * the same file.
 */

export interface XlsxSheet {
  /** At most 31 characters, none of []:*?/\ (Excel's rules for sheet names). */
  readonly name: string;
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Column widths in characters, one per header cell. */
  readonly widths: readonly number[];
}

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Style indexes in styles.xml's cellXfs. */
const STYLE_TEXT = 1;
const STYLE_HEADER = 2;

export function escapeXml(text: string): string {
  return (
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      // XML 1.0 has no other control characters; drop any that slip in rather than write a broken part.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to match them
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function sheetXml(sheet: XlsxSheet, index: number, stringIndex: (text: string) => number): string {
  const lastColumn = columnName(sheet.header.length - 1);
  const lastRow = sheet.rows.length + 1;
  const cols = sheet.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" style="${STYLE_TEXT}" customWidth="1"/>`)
    .join("");
  const row = (cells: readonly string[], r: number, style: number) =>
    `<row r="${r}">${sheet.header
      .map((_, c) => {
        const ref = `${columnName(c)}${r}`;
        const text = cells[c] ?? "";
        return text === ""
          ? `<c r="${ref}" s="${style}"/>`
          : `<c r="${ref}" s="${style}" t="s"><v>${stringIndex(text)}</v></c>`;
      })
      .join("")}</row>`;
  return [
    XML,
    `<worksheet xmlns="${MAIN}" xmlns:r="${REL}">`,
    `<dimension ref="A1:${lastColumn}${lastRow}"/>`,
    `<sheetViews><sheetView workbookViewId="0"${index === 0 ? ' tabSelected="1"' : ""}>`,
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>',
    "</sheetView></sheetViews>",
    '<sheetFormatPr defaultRowHeight="15"/>',
    `<cols>${cols}</cols>`,
    "<sheetData>",
    row(sheet.header, 1, STYLE_HEADER),
    ...sheet.rows.map((cells, i) => row(cells, i + 2, STYLE_TEXT)),
    "</sheetData>",
    `<autoFilter ref="A1:${lastColumn}${lastRow}"/>`,
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>',
    "</worksheet>",
  ].join("");
}

const STYLES = [
  XML,
  `<styleSheet xmlns="${MAIN}">`,
  '<fonts count="2"><font><sz val="12"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font></fonts>',
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="3">',
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
  '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
  "</cellXfs>",
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
  "</styleSheet>",
].join("");

/** The workbook's parts, by path inside the zip, in the order they are stored. */
export function xlsxParts(sheets: readonly XlsxSheet[]): [string, string][] {
  const strings: string[] = [];
  const indexOf = new Map<string, number>();
  let references = 0;
  const stringIndex = (text: string) => {
    references += 1;
    let i = indexOf.get(text);
    if (i === undefined) {
      i = strings.length;
      indexOf.set(text, i);
      strings.push(text);
    }
    return i;
  };
  const worksheets = sheets.map((sheet, i) => sheetXml(sheet, i, stringIndex));
  const sheetQuoted = (name: string) => `'${name.replaceAll("'", "''")}'`;
  const workbook = [
    XML,
    `<workbook xmlns="${MAIN}" xmlns:r="${REL}">`,
    '<bookViews><workbookView activeTab="0"/></bookViews>',
    `<sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>`,
    "<definedNames>",
    ...sheets.map(
      (s, i) =>
        `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(sheetQuoted(s.name))}!$A$1:$${columnName(s.header.length - 1)}$${s.rows.length + 1}</definedName>`,
    ),
    "</definedNames>",
    "</workbook>",
  ].join("");
  const sheetType = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
  const contentTypes = [
    XML,
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheets.map(
      (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${sheetType}"/>`,
    ),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    "</Types>",
  ].join("");
  const rootRels = `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const n = sheets.length;
  const workbookRels = [
    XML,
    `<Relationships xmlns="${PKG_REL}">`,
    ...sheets.map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    ),
    `<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`,
    "</Relationships>",
  ].join("");
  const sharedStrings = [
    XML,
    `<sst xmlns="${MAIN}" count="${references}" uniqueCount="${strings.length}">`,
    ...strings.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`),
    "</sst>",
  ].join("");
  return [
    ["[Content_Types].xml", contentTypes],
    ["_rels/.rels", rootRels],
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", workbookRels],
    ["xl/styles.xml", STYLES],
    ["xl/sharedStrings.xml", sharedStrings],
    ...worksheets.map((xml, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, xml]),
  ];
}

/** A zip of the given files, deflated, with the DOS timestamp 1980-01-01 00:00. */
export function zip(files: readonly [string, string | Uint8Array][]): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const packed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0, deflate
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by 2.0 (MS-DOS attributes)
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    // extra, comment, disk start, internal and external attributes stay 0
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function xlsx(sheets: readonly XlsxSheet[]): Buffer {
  return zip(xlsxParts(sheets));
}
