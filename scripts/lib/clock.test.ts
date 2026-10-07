import { describe, expect, it } from "vitest";
import { offsetFromDateHeader, serverClock } from "./clock.ts";

describe("offsetFromDateHeader", () => {
  it("assumes the reply was written mid-trip, half way through the header's second", () => {
    const sent = Date.parse("2026-10-07T10:00:00.000Z");
    const offset = offsetFromDateHeader("Wed, 07 Oct 2026 10:00:05 GMT", sent, sent + 200);
    expect(offset).toBe(5000 + 500 - 100);
  });

  it("returns null for a missing or broken header", () => {
    expect(offsetFromDateHeader(null, 0, 10)).toBeNull();
    expect(offsetFromDateHeader("yesterday-ish", 0, 10)).toBeNull();
  });
});

function fakeFetch(dateFor: () => string | null): typeof fetch {
  return (async () => {
    const date = dateFor();
    return new Response("{}", { headers: date === null ? {} : { date } });
  }) as unknown as typeof fetch;
}

describe("serverClock", () => {
  it("follows a server clock that is a minute ahead", async () => {
    const clock = await serverClock(
      "http://127.0.0.1:54721",
      "sb_publishable_x",
      fakeFetch(() => new Date(Date.now() + 60_000).toUTCString()),
    );
    expect(clock.offsetMs).toBeGreaterThan(58_000);
    expect(clock.offsetMs).toBeLessThan(62_000);
    expect(Math.abs(clock.now() - (Date.now() + clock.offsetMs))).toBeLessThan(50);
  });

  it("keeps the laptop clock within the header's one-second resolution or without a header", async () => {
    const same = await serverClock(
      "http://x.test",
      "k",
      fakeFetch(() => new Date().toUTCString()),
    );
    expect(same.offsetMs).toBe(0);
    const none = await serverClock(
      "http://x.test",
      "k",
      fakeFetch(() => null),
    );
    expect(none.offsetMs).toBe(0);
  });
});
