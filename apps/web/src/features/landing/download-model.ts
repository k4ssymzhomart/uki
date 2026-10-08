import type { IconName } from "@uki/ui/icons";

/**
 * The installers on the landing page (decided by the user on 8 October: "Download" goes to the latest
 * published GitHub release). The release workflow (.github/workflows/desktop-dist.yml, WP 0.15)
 * publishes each file under a stable name without a version, so `releases/latest/download/<name>`
 * always serves the newest one.
 */
export const RELEASES_URL = "https://github.com/k4ssymzhomart/uki/releases/latest";

/** The published file names, as the release workflow writes them. */
export const RELEASE_ASSETS = {
  macArm64: "Uki-mac-arm64.dmg",
  macX64: "Uki-mac-x64.dmg",
  winSetup: "Uki-Setup-win-x64.exe",
  winZip: "Uki-win-x64.zip",
  lockChrome: "Uki-Lock-chrome.zip",
  lockEdge: "Uki-Lock-edge.zip",
} as const;
export type ReleaseAsset = keyof typeof RELEASE_ASSETS;

export type ReleaseUrl = `${typeof RELEASES_URL}/download/${(typeof RELEASE_ASSETS)[ReleaseAsset]}`;

/** The newest release's copy of one file. */
export function releaseAssetUrl(asset: ReleaseAsset): ReleaseUrl {
  return `${RELEASES_URL}/download/${RELEASE_ASSETS[asset]}`;
}

/**
 * The download block's cards, in the order the user listed them: macOS Apple silicon, macOS Intel, the
 * Windows installer, the Windows zip that runs without an install, and Üki Lock for Chrome and Edge
 * (one card, one file per browser). Strings are `dashboard.landing.download.<id>.*`.
 */
export const DOWNLOAD_CARDS = [
  { id: "macArm", icon: "laptop", files: [{ id: "file", asset: "macArm64" }] },
  { id: "macIntel", icon: "laptop", files: [{ id: "file", asset: "macX64" }] },
  { id: "winSetup", icon: "screen", files: [{ id: "file", asset: "winSetup" }] },
  { id: "winZip", icon: "screen", files: [{ id: "file", asset: "winZip" }] },
  {
    id: "lock",
    icon: "browser-lock",
    files: [
      { id: "chrome", asset: "lockChrome" },
      { id: "edge", asset: "lockEdge" },
    ],
  },
] as const satisfies readonly {
  id: string;
  icon: IconName;
  files: readonly { id: string; asset: ReleaseAsset }[];
}[];
