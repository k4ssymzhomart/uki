// The Üki release (WP 0.15, .github/workflows/desktop-dist.yml): the six files under stable, version-free
// names, so https://github.com/<repo>/releases/latest/download/<name> always serves the newest one, and the
// release notes that say what each file is and how to open an unsigned build. `scripts/release-assets.ts`
// is the command line around these functions.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
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

// The version always starts with a digit, so `Uki-lab-<version>-x64.zip` (the lab zip, in release/lab and
// never shipped) cannot match the Windows zip even if it were in the same folder.
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

export type LockPairing = { state: "paired"; extensionId: string } | { state: "unset" };

/**
 * The Lock key pair as the release sees it: LOCK_DEV_PUBLIC_KEY goes into the extension's manifest and
 * VITE_LOCK_EXTENSION_ID into the app, which then accepts only that id. Both set and matching: the
 * packaged app pairs with the released Lock. Neither set: it pairs with nothing, and the notes say so.
 * One without the other, or an id that is not the key's, would publish a pair that silently never
 * connects, so that throws.
 */
export function lockPairing(env: {
  publicKey?: string | undefined;
  extensionId?: string | undefined;
}): LockPairing {
  const key = env.publicKey?.trim() || undefined;
  const id = env.extensionId?.trim() || undefined;
  if (key === undefined && id === undefined) return { state: "unset" };
  if (key === undefined) throw new Error("VITE_LOCK_EXTENSION_ID is set but LOCK_DEV_PUBLIC_KEY is not");
  if (id === undefined) throw new Error("LOCK_DEV_PUBLIC_KEY is set but VITE_LOCK_EXTENSION_ID is not");
  if (!/^[a-p]{32}$/.test(id))
    throw new Error("VITE_LOCK_EXTENSION_ID is not an extension id (32 letters a to p)");
  const fromKey = extensionIdFromManifestKey(key);
  if (fromKey !== id)
    throw new Error(
      `LOCK_DEV_PUBLIC_KEY gives the extension id ${fromKey}, but VITE_LOCK_EXTENSION_ID is ${id}`,
    );
  return { state: "paired", extensionId: id };
}

export type NotesInput = {
  tag: string;
  sha: string;
  repo: string;
  assets: readonly AssetFacts[];
  lock: LockPairing;
};

/** The release notes, in Markdown. English only: GitHub's release page is not a product screen. */
export function releaseNotes(input: NotesInput): string {
  const { tag, sha, repo, assets, lock } = input;
  const latest = `https://github.com/${repo}/releases/latest/download`;
  const rows = RELEASE_ASSETS.map((asset) => {
    const facts = assets.find((entry) => entry.name === asset.name);
    if (facts === undefined) throw new Error(`no size and hash for ${asset.name}`);
    return `| [\`${asset.name}\`](${latest}/${asset.name}) | ${asset.what} | ${formatMegabytes(facts.bytes)} | \`${facts.sha256}\` |`;
  });

  const pairing =
    lock.state === "paired"
      ? [
          `Üki Lock's extension id is \`${lock.extensionId}\`, fixed by the key in its manifest, and this app accepts only that id. After loading the Lock, its card on \`chrome://extensions\` (or \`edge://extensions\`) shows this id.`,
        ]
      : [
          "**The packaged app cannot pair with Üki Lock in this release.** The Lock key pair was not set when it was built, so the Lock has no fixed extension id and the packaged app refuses every extension (only development builds accept any extension). Browser exams need the pair: make it with `pnpm --filter lock make-key` (docs/runbooks/lock-pairing.md), set the repository variables `LOCK_DEV_PUBLIC_KEY` and `VITE_LOCK_EXTENSION_ID`, and run the Desktop installers workflow again. Exams in the Üki app do not need the Lock.",
        ];

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
    "**Üki Lock (Chrome or Edge).** Open `chrome://extensions` (in Edge, `edge://extensions`) and turn on Developer mode. Then either drag the zip onto that page, or unzip it and choose Load unpacked with the unzipped folder (the one with `manifest.json` in it). Pin Üki Lock to the toolbar, start the Üki app, and click the Lock's face to pair with the 6-digit code the app shows.",
    "",
    "## Pairing Üki Lock with the app",
    "",
    ...pairing,
    "",
  ].join("\n");
}
