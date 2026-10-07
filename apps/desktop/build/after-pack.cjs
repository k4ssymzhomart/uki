// electron-builder afterPack: flips Electron's fuses in the packaged binary ("Hardening" in
// docs/phase-0-plan.md). It runs after the app and its asar integrity are in place and before signing,
// which Phase 0 skips; on macOS the ad hoc signature is renewed so the unsigned app still starts.
const path = require("node:path");

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
