// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import catalog from "@uki/i18n/catalog.json";
import { describe, expect, it } from "vitest";

const yml = readFileSync(new URL("../../electron-builder.yml", import.meta.url), "utf8");
const afterPack = readFileSync(new URL("../../build/after-pack.cjs", import.meta.url), "utf8");
const labYml = readFileSync(new URL("../../electron-builder.lab.yml", import.meta.url), "utf8");
const scripts = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;

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

  it("builds unsigned dmg (arm64, x64), NSIS and zip (x64) with the models and the fuses hook", () => {
    expect(value("identity")).toBe("null");
    expect(yml).toMatch(/target: dmg\s+arch:\s+- arm64\s+- x64/);
    expect(yml).toMatch(/target: nsis\s+arch:\s+- x64/);
    // The zip of the unpacked app runs from any folder or a USB drive without an install (WP 0.12).
    expect(yml).toMatch(/target: zip\s+arch:\s+- x64/);
    // NSIS: an assisted installer whose install-mode page offers the current user only.
    expect(value("oneClick")).toBe("false");
    expect(value("perMachine")).toBe("false");
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

  it("flips the plan's five fuses and turns off file:// privileges, and no other fuse", () => {
    const flipped = Object.fromEntries(
      [...afterPack.matchAll(/\[FuseV1Options\.(\w+)\]:\s*(true|false)/g)].map(([, fuse, on]) => [
        fuse,
        on === "true",
      ]),
    );
    expect(flipped).toEqual({
      RunAsNode: false,
      EnableNodeOptionsEnvironmentVariable: false,
      EnableNodeCliInspectArguments: false,
      OnlyLoadAppFromAsar: true,
      EnableEmbeddedAsarIntegrityValidation: true,
      // The renderer and the models load over uki:// (protocol.ts), never from file://.
      GrantFileProtocolExtraPrivileges: false,
    });
  });
});

describe("electron-builder.lab.yml", () => {
  it("builds the lab zip from the same config under its own name and folder", () => {
    expect(/^extends:\s*(.+)$/m.exec(labYml)?.[1]?.trim()).toBe("./electron-builder.yml");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own ${macro} syntax
    expect(/^artifactName:\s*(.+)$/m.exec(labYml)?.[1]?.trim()).toBe("Uki-lab-${version}-${arch}.${ext}");
    expect(/^\s+output:\s*(.+)$/m.exec(labYml)?.[1]?.trim()).toBe("release/lab");
  });

  it("is built in lab mode as the Windows x64 zip only, by its own script", () => {
    expect(scripts["dist:lab"]).toBe(
      "electron-vite build --mode lab && electron-builder --config electron-builder.lab.yml --win zip --x64",
    );
    // The shipped build never uses lab mode.
    expect(scripts.dist).not.toMatch(/--mode|lab/);
  });
});
