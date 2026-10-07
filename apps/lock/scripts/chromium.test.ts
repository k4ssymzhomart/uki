// @vitest-environment node
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { chromiumExecutable } from "./chromium.ts";

describe("chromiumExecutable", () => {
  it("defaults to the Chrome for Testing build the installed Playwright uses", () => {
    expect(chromiumExecutable({})).toBe(chromium.executablePath());
    expect(chromiumExecutable({ PW_CHROMIUM: "" })).toBe(chromium.executablePath());
  });

  it("lets PW_CHROMIUM override it", () => {
    expect(chromiumExecutable({ PW_CHROMIUM: "/opt/chrome-for-testing/chrome" })).toBe(
      "/opt/chrome-for-testing/chrome",
    );
  });
});
