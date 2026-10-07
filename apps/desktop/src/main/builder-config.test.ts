// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import catalog from "@uki/i18n/catalog.json";
import { describe, expect, it } from "vitest";

const yml = readFileSync(new URL("../../electron-builder.yml", import.meta.url), "utf8");
const afterPack = readFileSync(new URL("../../build/after-pack.cjs", import.meta.url), "utf8");

function value(key: string): string | undefined {
  return new RegExp(`^\\s*${key}:\\s*(.+)$`, "m").exec(yml)?.[1]?.trim();
}

describe("electron-builder.yml", () => {
  it("names the app and its camera use from the catalog", () => {
    expect(value("appId")).toBe("kz.uki.app");
    // ASCII bundle and helper names (a non-ASCII productName kills the packaged macOS app at launch);
    // people see Üki through the display name and the Windows shortcut.
    expect(value("productName")).toBe("Uki");
    expect(value("CFBundleDisplayName")).toBe("Üki");
    expect(value("shortcutName")).toBe("Üki");
    const privacy = catalog.keys.find((entry) => entry.key === "join.privacy");
    expect(value("NSCameraUsageDescription")).toBe(privacy?.en);
  });

  it("builds unsigned dmg (arm64, x64) and NSIS (x64) with the models and the fuses hook", () => {
    expect(value("identity")).toBe("null");
    expect(yml).toMatch(/target: dmg\s+arch:\s+- arm64\s+- x64/);
    expect(yml).toMatch(/target: nsis\s+arch:\s+- x64/);
    expect(value("- from")).toBe("resources/models");
    expect(value("afterPack")).toBe("build/after-pack.cjs");
  });

  it("ships the brand kit's app icons and ASCII installer names", () => {
    for (const icon of ["icon.icns", "icon.ico"]) {
      expect(existsSync(new URL(`../../build/${icon}`, import.meta.url)), icon).toBe(true);
    }
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own ${macro} syntax
    expect(value("artifactName")).toBe("Uki-${version}-${arch}.${ext}");
  });

  it("flips the five fuses the plan names", () => {
    for (const fuse of [
      "RunAsNode]: false",
      "EnableNodeOptionsEnvironmentVariable]: false",
      "EnableNodeCliInspectArguments]: false",
      "OnlyLoadAppFromAsar]: true",
      "EnableEmbeddedAsarIntegrityValidation]: true",
    ]) {
      expect(afterPack).toContain(fuse);
    }
  });
});
