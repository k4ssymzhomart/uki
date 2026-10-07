// @vitest-environment node
import { describe, expect, it } from "vitest";
import { asciiUserAgent } from "./user-agent.ts";

describe("asciiUserAgent", () => {
  it("turns the app name into ASCII and keeps the rest", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Üki/0.0.0 Chrome/146.0.0.0 Electron/44.6.0 Safari/537.36";
    const ascii = asciiUserAgent(ua);
    expect(ascii).toContain(" Uki/0.0.0 ");
    expect(ascii).toBe(ua.replace("Üki", "Uki"));
    expect([...ascii].every((char) => char.charCodeAt(0) <= 0x7e)).toBe(true);
  });
});
