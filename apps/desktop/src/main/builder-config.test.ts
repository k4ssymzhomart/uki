// @vitest-environment node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import catalog from "@uki/i18n/catalog.json";
import { describe, expect, it } from "vitest";
import { PACKAGED_KOFFI_DIR } from "./keyboard-hook-win32.ts";

const yml = readFileSync(new URL("../../electron-builder.yml", import.meta.url), "utf8");
const afterPack = readFileSync(new URL("../../build/after-pack.cjs", import.meta.url), "utf8");
const labYml = readFileSync(new URL("../../electron-builder.lab.yml", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const scripts = pkg.scripts;

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

/** The `win:` section of electron-builder.yml, up to the next top-level key. */
const winSection = /^win:\n((?: {2}.*\n|\n)+)/m.exec(yml)?.[1] ?? "";

/** The filter list of the extraResources entry copied from `from`. */
function extraResourceFilter(from: string): string[] {
  // Filter items sit 8 spaces deep, the next entry's "- from" only 4.
  const entry = new RegExp(`- from: ${from}\\n\\s+to: (.+)\\n\\s+filter:\\n((?: {8}- .+\\n)+)`).exec(
    winSection,
  );
  if (!entry) return [];
  return [...(entry[2] ?? "").matchAll(/- (.+)/g)].map(([, file]) => file?.trim() ?? "");
}

describe("the keyboard hook's Koffi in the Windows builds (WP 0.13)", () => {
  it("is copied for Windows only, outside the asar, under resources/koffi/node_modules", () => {
    expect(winSection).toMatch(/- from: node_modules\/koffi\n\s+to: koffi\/node_modules\/koffi\n/);
    expect(winSection).toMatch(
      /- from: node_modules\/@koromix\/koffi-win32-x64\n\s+to: koffi\/node_modules\/@koromix\/koffi-win32-x64\n/,
    );
    expect(PACKAGED_KOFFI_DIR).toBe("koffi");
    // Nothing of Koffi outside the Windows section: the macOS dmg carries none of it.
    const outsideWin = yml.replace(winSection, "").replace(/^\s*#.*$/gm, "");
    expect(outsideWin).not.toMatch(/koffi/i);
    expect(value("asarUnpack")).toBeUndefined();
  });

  it("pins Koffi and its Windows binary to the same version", () => {
    const version = pkg.dependencies.koffi;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.optionalDependencies?.["@koromix/koffi-win32-x64"]).toBe(version);
    const koffiPkg = JSON.parse(
      readFileSync(join(dirname(createRequire(import.meta.url).resolve("koffi")), "package.json"), "utf8"),
    ) as { version: string; optionalDependencies: Record<string, string> };
    expect(koffiPkg.version).toBe(version);
    expect(koffiPkg.optionalDependencies["@koromix/koffi-win32-x64"]).toBe(version);
  });

  it("copies every file the Koffi loader needs: the packaged layout loads on this machine", () => {
    // The same filter, applied to the installed koffi and this platform's binary package, in a temporary
    // resources folder; a fresh Node process then loads Koffi from there as the packaged app does.
    const loaderFiles = extraResourceFilter("node_modules/koffi");
    const binaryFiles = extraResourceFilter("node_modules/@koromix/koffi-win32-x64");
    expect(loaderFiles).toContain("LICENSE.txt");
    expect(binaryFiles).toContain("win32_x64/koffi.node");

    const koffiDir = dirname(createRequire(import.meta.url).resolve("koffi"));
    const platform = `${process.platform}-${process.arch}`;
    const binaryDir = dirname(
      createRequire(join(koffiDir, "index.cjs")).resolve(`@koromix/koffi-${platform}`),
    );
    const resources = mkdtempSync(join(tmpdir(), "uki-koffi-"));
    try {
      const modules = join(resources, PACKAGED_KOFFI_DIR, "node_modules");
      for (const file of loaderFiles) {
        expect(existsSync(join(koffiDir, file)), `koffi/${file}`).toBe(true);
        mkdirSync(dirname(join(modules, "koffi", file)), { recursive: true });
        cpSync(join(koffiDir, file), join(modules, "koffi", file));
      }
      for (const file of binaryFiles.map((it) => it.replace("win32_x64", platform.replace("-", "_")))) {
        mkdirSync(dirname(join(modules, "@koromix", `koffi-${platform}`, file)), { recursive: true });
        cpSync(join(binaryDir, file), join(modules, "@koromix", `koffi-${platform}`, file));
      }
      const script = [
        "const { createRequire } = require('node:module');",
        "const { join } = require('node:path');",
        `const koffi = createRequire(join(process.argv[1], ${JSON.stringify(PACKAGED_KOFFI_DIR)}, 'load.cjs'))('koffi');`,
        "process.stdout.write(String(koffi.version));",
      ].join("\n");
      const loaded = execFileSync(process.execPath, ["-e", script, resources], { encoding: "utf8" });
      expect(loaded).toBe(pkg.dependencies.koffi);
    } finally {
      rmSync(resources, { recursive: true, force: true });
    }
  });

  it("fails a Windows build that lacks Koffi, before the zip and the installer are made", () => {
    expect(afterPack).toContain('electronPlatformName === "win32"');
    expect(afterPack).toContain('"koffi/index.cjs"');
    expect(afterPack).toContain('"@koromix/koffi-win32-x64/win32_x64/koffi.node"');
  });
});
