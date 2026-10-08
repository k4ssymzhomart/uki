import { describe, expect, it } from "vitest";
import { formatDayLongMonth, formatDayMonth, formatDayMonthYear } from "./student-format.ts";

describe("A.2 and A.3 dates", () => {
  it("writes them as the frames do in English, in Asia/Almaty", () => {
    expect(formatDayMonth("2026-10-09T05:00:00Z", "en")).toBe("9 Oct");
    expect(formatDayMonth("2026-09-24T04:00:00Z", "en")).toBe("24 Sep");
    // 23:30 UTC on 8 October is already 9 October in Almaty.
    expect(formatDayMonth("2026-10-08T23:30:00Z", "en")).toBe("9 Oct");
    expect(formatDayLongMonth("2026-09-04T04:00:00Z", "en")).toBe("4 September");
    expect(formatDayMonthYear(Date.parse("2027-01-07T05:20:00Z"), "en")).toBe("7 Jan 2027");
    expect(formatDayMonthYear(Date.parse("2026-09-07T05:20:00Z"), "en")).toBe("7 Sep 2026");
  });

  it("writes them in Russian without the abbreviation's full stop or the year's г.", () => {
    expect(formatDayMonth("2026-10-09T05:00:00Z", "ru")).toBe("9 окт");
    expect(formatDayLongMonth("2026-09-04T04:00:00Z", "ru")).toBe("4 сентября");
    expect(formatDayMonthYear(Date.parse("2027-01-07T05:20:00Z"), "ru")).toBe("7 янв 2027");
  });
});
