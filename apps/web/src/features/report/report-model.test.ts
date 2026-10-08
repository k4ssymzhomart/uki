import { type CompactEvent, formatVerifyCode, normalizeVerifyCode } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import {
  almatyStamp,
  CSV_COLUMNS,
  csvField,
  csvFileName,
  daysLeft,
  eventsCsv,
  firstStillByFlag,
  identityOf,
  orderedFlags,
  printedVerifyCode,
  shareUrl,
  shortName,
  timeUsed,
} from "./report-model.ts";
import { reportFixture } from "./test-fixtures.ts";

const SESSION = "d0000000-0000-4000-8003-000000000007";
const EXAM = "e0000000-0000-4000-8000-000000000003";

function event(overrides: Partial<CompactEvent>): CompactEvent {
  return {
    id: "01900000-0000-7000-8000-000000000001",
    session_id: SESSION,
    exam_id: EXAM,
    type: "phone.detected",
    source: "app",
    review: "flag",
    at: "2026-10-09T05:47:10.000Z",
    received_at: "2026-10-09T05:47:10.400Z",
    data: { score: 0.94, held_ms: 6000 },
    frame_count: 1,
    ...overrides,
  };
}

describe("the verify code", () => {
  it("prints the 8 characters as UKI-XXXX-XXXX through one function", () => {
    expect(printedVerifyCode("7K2M9QXD")).toBe("UKI-7K2M-9QXD");
    expect(printedVerifyCode("7K2M9QXD")).toBe(formatVerifyCode("7K2M9QXD"));
  });

  it("reads back from its printed form, in any case, with or without hyphens and the prefix", () => {
    const printed = printedVerifyCode("7K2M9QXD");
    expect(normalizeVerifyCode(printed)).toBe("7K2M9QXD");
    expect(normalizeVerifyCode(printed.toLowerCase())).toBe("7K2M9QXD");
    expect(normalizeVerifyCode("7k2m 9qxd")).toBe("7K2M9QXD");
    expect(normalizeVerifyCode("UKI-RPT-0917-MT")).toBeNull();
  });
});

describe("report rows", () => {
  it("writes the reviewer as the first name and the last name's initial", () => {
    expect(shortName("Aigerim Sadykova")).toBe("Aigerim S.");
    expect(shortName("  Нурлан   Беков ")).toBe("Нурлан Б.");
    expect(shortName("Dana")).toBe("Dana");
  });

  it("rounds the time used and adds extra time to the minutes allowed", () => {
    const report = reportFixture();
    expect(timeUsed(report)).toEqual({ used: 87, total: 90 });
    expect(timeUsed({ ...report, session: { ...report.session, time_used_s: 89, extra_min: 5 } })).toEqual({
      used: 1,
      total: 95,
    });
  });

  it("reads identity as matched with its time, matched without one, or not checked", () => {
    const { session } = reportFixture();
    expect(identityOf(session)).toEqual({ kind: "matched", at: session.identity_at });
    expect(identityOf({ ...session, identity_at: null })).toEqual({ kind: "matched", at: null });
    expect(identityOf({ ...session, identity_result: null, identity_at: null })).toEqual({
      kind: "unchecked",
    });
  });

  it("orders flags by time and keeps one still per flag, the earliest", () => {
    const report = reportFixture();
    expect(orderedFlags(report.flags).map((flag) => flag.type)).toEqual([
      "gaze.off_screen",
      "phone.detected",
      "gaze.down",
    ]);
    const stills = firstStillByFlag([
      { event_id: "a", url: "https://x/2", captured_at: "2026-10-09T05:47:12Z" },
      { event_id: "a", url: "https://x/1", captured_at: "2026-10-09T05:47:10Z" },
      { event_id: "b", url: "https://x/3", captured_at: "2026-10-09T05:43:02Z" },
    ]);
    expect(stills).toEqual({ a: "https://x/1", b: "https://x/3" });
  });
});

describe("Export CSV", () => {
  it("quotes commas, quotes and line breaks, and defuses spreadsheet formulas", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField(3)).toBe("3");
    expect(csvField(null)).toBe("");
    expect(csvField('say "hi", then')).toBe('"say ""hi"", then"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-1")).toBe("'-1");
    expect(csvField("@cmd")).toBe("'@cmd");
  });

  it("writes a header and one row per event, oldest first, in UTC and in Almaty", () => {
    const csv = eventsCsv([
      event({
        id: "01900000-0000-7000-8000-000000000002",
        type: "proctor.note",
        source: "proctor",
        review: "none",
        at: "2026-10-09T05:50:00.000Z",
        received_at: "2026-10-09T05:50:00.100Z",
        data: { text: '=1+1, said "no"', staff_id: "x" },
        frame_count: 0,
      }),
      event({}),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines[1]).toBe(
      '2026-10-09T05:47:10.000Z,2026-10-09 10:47:10,phone.detected,app,flag,1,2026-10-09T05:47:10.400Z,"{""score"":0.94,""held_ms"":6000}"',
    );
    expect(
      lines[2]?.startsWith("2026-10-09T05:50:00.000Z,2026-10-09 10:50:00,proctor.note,proctor,none,0,"),
    ).toBe(true);
    expect(lines[2]).toContain('"{""text"":""=1+1, said \\""no\\"""",""staff_id"":""x""}"');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("");
  });

  it("names the file after the printed code", () => {
    expect(csvFileName("7K2M9QXD")).toBe("uki-report-UKI-7K2M-9QXD-events.csv");
    expect(csvFileName(null)).toBe("uki-report-events.csv");
  });

  it("stamps Almaty time across midnight UTC", () => {
    expect(almatyStamp("2026-10-08T19:30:00Z")).toBe("2026-10-09 00:30:00");
  });
});

describe("the share link", () => {
  it("joins the site's origin and create_share's path", () => {
    expect(shareUrl("https://uki.example", `/r/${"A".repeat(43)}`)).toBe(
      `https://uki.example/r/${"A".repeat(43)}`,
    );
    expect(shareUrl("http://localhost:3000/", "/r/abc")).toBe("http://localhost:3000/r/abc");
  });

  it("counts whole days left, at least one", () => {
    const now = Date.parse("2026-10-09T06:52:00Z");
    expect(daysLeft("2026-11-08T06:52:00Z", now)).toBe(30);
    expect(daysLeft("2026-10-16T06:52:00Z", now)).toBe(7);
    expect(daysLeft("2026-10-09T07:00:00Z", now)).toBe(1);
  });
});
