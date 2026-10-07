// @vitest-environment node
import { describe, expect, it } from "vitest";
import { localeFromTag, readRendererLocale } from "./locale.ts";

describe("localeFromTag", () => {
  it("maps the renderer's BCP 47 tags back to locales", () => {
    expect(localeFromTag("kk-KZ")).toBe("kk");
    expect(localeFromTag("ru-RU")).toBe("ru");
    expect(localeFromTag("en-GB")).toBe("en");
    expect(localeFromTag("EN")).toBe("en");
  });

  it("falls back to Kazakh", () => {
    expect(localeFromTag("")).toBe("kk");
    expect(localeFromTag("de-DE")).toBe("kk");
    expect(localeFromTag(null)).toBe("kk");
    expect(localeFromTag({ lang: "ru" })).toBe("kk");
  });
});

describe("readRendererLocale", () => {
  it("reads <html lang>, and survives a page that does not answer", async () => {
    await expect(readRendererLocale({ executeJavaScript: async () => "ru-RU" })).resolves.toBe("ru");
    await expect(
      readRendererLocale({
        executeJavaScript: async () => {
          throw new Error("Script failed to execute");
        },
      }),
    ).resolves.toBe("kk");
  });
});
