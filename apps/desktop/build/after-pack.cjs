// electron-builder afterPack: flips Electron's fuses in the packaged binary ("Hardening" in
// docs/phase-0-plan.md). It runs after the app and its asar integrity are in place and before signing,
// which Phase 0 skips; on macOS the ad hoc signature is renewed so the unsigned app still starts. On
// Windows it first checks that the keyboard hook's Koffi is in the app (win.extraResources), because the
// zip and the installer are made from this folder afterwards.
const { existsSync } = require("node:fs");
const path = require("node:path");

/** The files the packaged Windows app loads Koffi from (src/main/keyboard-hook-win32.ts). */
const KOFFI_FILES = ["koffi/index.cjs", "@koromix/koffi-win32-x64/win32_x64/koffi.node"];

/** @param {import("app-builder-lib").AfterPackContext} context */
exports.default = async function afterPack(context) {
  const { flipFuses, FuseV1Options, FuseVersion } = await import("@electron/fuses");
  const { appOutDir, electronPlatformName, packager } = context;
  const name = packager.appInfo.productFilename;
  const binary = {
    darwin: path.join(appOutDir, `${name}.app`),
    mas: path.join(appOutDir, `${name}.app`),
    win32: path.join(appOutDir, `${name}.exe`),
  }[electronPlatformName];
  if (binary === undefined)
    throw new Error(`after-pack: Üki ships for macOS and Windows, not ${electronPlatformName}`);

  if (electronPlatformName === "win32") {
    const modules = path.join(appOutDir, "resources", "koffi", "node_modules");
    const missing = KOFFI_FILES.filter((file) => !existsSync(path.join(modules, file)));
    if (missing.length > 0)
      throw new Error(
        `after-pack: the keyboard hook's Koffi is missing from resources/koffi/node_modules: ${missing.join(", ")}. ` +
          "Install on Windows x64 so that the optional @koromix/koffi-win32-x64 is present.",
      );
  }

  await flipFuses(binary, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === "darwin",
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    // The app never loads a page from file:// (renderer and models come over uki://, src/main/protocol.ts),
    // so file:// pages need none of Electron's extra privileges.
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
