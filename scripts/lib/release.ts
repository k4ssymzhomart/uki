// The Üki release (WP 0.15, .github/workflows/desktop-dist.yml): the six files under stable, version-free
// names, so https://github.com/<repo>/releases/latest/download/<name> always serves the newest one, and the
// release notes that say what each file is and how to open an unsigned build. `scripts/release-assets.ts`
// is the command line around these functions.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { extensionIdFromManifestKey } from "../../apps/lock/src/lib/extension-id.ts";

export type Platform = "mac" | "win" | "lock";

export type ReleaseAsset = {
  /** The published name: stable across releases, no version in it. */
  name: string;
  platform: Platform;
  /** Where the build leaves the file, from the repository root. */
  dir: string;
  /** The build's own file name, which carries the version. */
  source: RegExp;
  /** One line for the release notes. */
  what: string;
};

// The version always starts with a digit, so `Uki-lab-<version>-x64.zip` and `Uki-smoke-<version>-x64.zip`
// (the lab and smoke zips, in release/lab and release/smoke and never shipped) cannot match the Windows zip
// even if they were in the same folder.
export const RELEASE_ASSETS: readonly ReleaseAsset[] = [
  {
    name: "Uki-mac-arm64.dmg",
    platform: "mac",
    dir: "apps/desktop/release",
    source: /^Uki-\d[^/]*-arm64\.dmg$/,
    what: "Üki for Macs with Apple silicon (M1 and later)",
  },
  {
    name: "Uki-mac-x64.dmg",
    platform: "mac",
    dir: "apps/desktop/release",
    source: /^Uki-\d[^/]*-x64\.dmg$/,
    what: "Üki for Intel Macs",
  },
  {
    name: "Uki-Setup-win-x64.exe",
    platform: "win",
    dir: "apps/desktop/release",
    source: /^Uki-\d[^/]*-x64\.exe$/,
    what: "Üki installer for Windows 10 and 11 (x64); choose “Only for me” to install without admin rights",
  },
  {
    name: "Uki-win-x64.zip",
    platform: "win",
    dir: "apps/desktop/release",
    source: /^Uki-\d[^/]*-x64\.zip$/,
    what: "Üki for Windows (x64) without an install: unzip it anywhere, even on a USB drive, and run Uki.exe",
  },
  {
    name: "Uki-Lock-chrome.zip",
    platform: "lock",
    dir: "apps/lock/.output",
    source: /^lock-\d[^/]*-chrome\.zip$/,
    what: "Üki Lock, the browser extension for exams in the university portal, for Google Chrome",
  },
  {
    name: "Uki-Lock-edge.zip",
    platform: "lock",
    dir: "apps/lock/.output",
    source: /^lock-\d[^/]*-edge\.zip$/,
    what: "Üki Lock for Microsoft Edge",
  },
];

/** The one file in `files` that matches `asset`; throws when there is none or more than one. */
export function pickSource(asset: ReleaseAsset, files: readonly string[]): string {
  const matches = files.filter((file) => asset.source.test(file));
  if (matches.length === 1) return matches[0] as string;
  const found = matches.length === 0 ? "none" : matches.join(", ");
  throw new Error(`${asset.name}: expected one file like ${asset.source} in ${asset.dir}, found ${found}`);
}

/** Copies one platform's build output to `out` under the published names; returns those names. */
export async function stagePlatform(root: string, platform: Platform, out: string): Promise<string[]> {
  await mkdir(out, { recursive: true });
  const staged: string[] = [];
  for (const asset of RELEASE_ASSETS.filter((entry) => entry.platform === platform)) {
    const dir = join(root, asset.dir);
    const source = pickSource(asset, await readdir(dir));
    await copyFile(join(dir, source), join(out, asset.name));
    staged.push(asset.name);
  }
  return staged;
}

/** Problems with a release folder: each of the six files once, and nothing else. Empty when it is right. */
export function releaseDirProblems(files: readonly string[]): string[] {
  const expected = new Set(RELEASE_ASSETS.map((asset) => asset.name));
  const missing = [...expected].filter((name) => !files.includes(name));
  const unexpected = files.filter((name) => !expected.has(name));
  return [
    ...missing.map((name) => `missing ${name}`),
    ...unexpected.map((name) => `unexpected ${name} (only the six release files are published)`),
  ];
}

export type AssetFacts = { name: string; bytes: number; sha256: string };

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Size and SHA-256 of each release file in `dir`, in the order of RELEASE_ASSETS. */
export async function assetFacts(dir: string): Promise<AssetFacts[]> {
  const facts: AssetFacts[] = [];
  for (const asset of RELEASE_ASSETS) {
    const path = join(dir, asset.name);
    facts.push({ name: asset.name, bytes: (await stat(path)).size, sha256: await sha256File(path) });
  }
  return facts;
}

/** "157.1 MB", in decimal megabytes as GitHub and docs/phase-0-exit.md give them. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

const EXTENSION_ID = /^[a-p]{32}$/;

/**
 * The Lock key pair the release is built with: LOCK_DEV_PUBLIC_KEY goes into the extension's manifest as
 * `key`, which fixes its id, and VITE_LOCK_EXTENSION_ID into the app, which then accepts only that id.
 * Returns the id. A release without the pair, with one half of it, or with an id that is not the key's
 * would ship an app that silently never pairs with the Lock beside it, so each of those throws.
 */
export function releaseExtensionId(env: {
  publicKey?: string | undefined;
  extensionId?: string | undefined;
}): string {
  const key = env.publicKey?.trim() || undefined;
  const id = env.extensionId?.trim() || undefined;
  if (key === undefined || id === undefined) {
    const missing: string[] = [];
    if (key === undefined) missing.push("LOCK_DEV_PUBLIC_KEY");
    if (id === undefined) missing.push("VITE_LOCK_EXTENSION_ID");
    throw new Error(
      `${missing.join(" and ")} not set: the release needs the Üki Lock key pair (pnpm --filter lock make-key, docs/runbooks/lock-pairing.md)`,
    );
  }
  if (!EXTENSION_ID.test(id))
    throw new Error("VITE_LOCK_EXTENSION_ID is not an extension id (32 letters a to p)");
  const fromKey = extensionIdFromManifestKey(key);
  if (fromKey !== id)
    throw new Error(
      `LOCK_DEV_PUBLIC_KEY gives the extension id ${fromKey}, but VITE_LOCK_EXTENSION_ID is ${id}`,
    );
  return id;
}

const BuiltManifest = z.object({
  name: z.string(),
  version: z.string(),
  key: z.string().min(1, "has an empty key").optional(),
});

/**
 * Problems with one built Lock manifest (the `manifest.json` inside a Lock zip): it must carry the key
 * whose id is `extensionId`, the only id the released app accepts, and the release's version. Empty when
 * it is right.
 */
export function builtLockProblems(
  file: string,
  manifestJson: string,
  expected: { extensionId: string; version?: string | undefined },
): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(manifestJson);
  } catch {
    return [`${file}: manifest.json is not JSON`];
  }
  const parsed = BuiltManifest.safeParse(raw);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => `${file}: manifest ${issue.path.join(".")} ${issue.message}`);
  const manifest = parsed.data;
  const problems: string[] = [];
  if (manifest.key === undefined) {
    problems.push(
      `${file}: the manifest has no key, so the browser gives the Lock a random id that the app refuses`,
    );
  } else {
    const id = extensionIdFromManifestKey(manifest.key);
    if (id !== expected.extensionId)
      problems.push(
        `${file}: the manifest's key gives the extension id ${id}, but the app accepts ${expected.extensionId}`,
      );
  }
  if (expected.version !== undefined && manifest.version !== expected.version)
    problems.push(`${file}: version ${manifest.version}, expected ${expected.version}`);
  return problems;
}

export type NotesInput = {
  tag: string;
  sha: string;
  repo: string;
  assets: readonly AssetFacts[];
  /** The Lock's fixed id, from releaseExtensionId. */
  lockExtensionId: string;
};

/** The release notes, in Markdown. English only: GitHub's release page is not a product screen. */
export function releaseNotes(input: NotesInput): string {
  const { tag, sha, repo, assets, lockExtensionId } = input;
  const latest = `https://github.com/${repo}/releases/latest/download`;
  const rows = RELEASE_ASSETS.map((asset) => {
    const facts = assets.find((entry) => entry.name === asset.name);
    if (facts === undefined) throw new Error(`no size and hash for ${asset.name}`);
    return `| [\`${asset.name}\`](${latest}/${asset.name}) | ${asset.what} | ${formatMegabytes(facts.bytes)} | \`${facts.sha256}\` |`;
  });

  return [
    `Üki ${tag}, built from ${sha.slice(0, 7)} on main by the Desktop installers workflow. The apps connect to the Üki cloud project in Frankfurt. The builds are unsigned: see "First launch" below.`,
    "",
    "| File | What it is | Size | SHA-256 |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    `Each file always has the same address in the newest release: \`${latest}/<file>\`.`,
    "",
    "## First launch (unsigned builds)",
    "",
    "**macOS.** Open the dmg and drag Üki to Applications. The app is not signed by an Apple developer, so macOS blocks the first launch of a downloaded copy. Either:",
    "",
    "- right-click (or Control-click) Üki in Applications, choose Open, then Open again (macOS 14 and earlier); on macOS 15 and later, try to open it once, then go to System Settings, Privacy & Security, and choose Open Anyway next to the line about Üki; or",
    "- remove the download's quarantine flag once in Terminal, which also cures \"Üki is damaged and can't be opened\": `xattr -dr com.apple.quarantine /Applications/Uki.app`",
    "",
    "On the first launch, allow the camera.",
    "",
    '**Windows.** If SmartScreen says "Windows protected your PC", choose More info, then Run anyway. For the zip, first right-click it, choose Properties and tick Unblock, then unzip it and run `Uki.exe`; the unzipped files then do not each ask again.',
    "",
    "**Üki Lock (Chrome or Edge).** Take `Uki-Lock-chrome.zip` for Chrome and `Uki-Lock-edge.zip` for Edge, and unzip it into a folder you keep: the browser loads the Lock from that folder every time it starts. Open `chrome://extensions` (in Edge, `edge://extensions`), turn on Developer mode, choose Load unpacked and pick the unzipped folder (the one with `manifest.json` in it). Pin Üki Lock to the toolbar, start the Üki app, and click the Lock's face to pair with the 6-digit code the app shows.",
    "",
    "## Pairing Üki Lock with the app",
    "",
    `Üki Lock's extension id is \`${lockExtensionId}\`, fixed by the key in its manifest, and the app in this release accepts only that id. After loading the Lock, its card on \`chrome://extensions\` (or \`edge://extensions\`) shows this id. Use the Lock and the app from the same release. Exams in the Üki app do not need the Lock.`,
    "",
  ].join("\n");
}
