// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_CARDS, RELEASE_ASSETS, RELEASES_URL, releaseAssetUrl } from "./download-model.ts";

describe("the download block", () => {
  it("points at the latest published release on GitHub", () => {
    expect(RELEASES_URL).toBe("https://github.com/k4ssymzhomart/uki/releases/latest");
  });

  it("uses the six stable names that the release workflow publishes (WP 0.15)", () => {
    // The release's own list (scripts/lib/release.ts, RELEASE_ASSETS[].name) read as text, so a renamed
    // file fails here before the landing links a name the release no longer has.
    const release = readFileSync(new URL("../../../../../scripts/lib/release.ts", import.meta.url), "utf8");
    const published = [...release.matchAll(/^ {4}name: "([^"]+)",$/gm)].map((match) => match[1]);
    expect(Object.values(RELEASE_ASSETS)).toEqual(published);
    expect(Object.values(RELEASE_ASSETS)).toEqual([
      "Uki-mac-arm64.dmg",
      "Uki-mac-x64.dmg",
      "Uki-Setup-win-x64.exe",
      "Uki-win-x64.zip",
      "Uki-Lock-chrome.zip",
      "Uki-Lock-edge.zip",
    ]);
  });

  it("links each file under releases/latest/download", () => {
    expect(releaseAssetUrl("macArm64")).toBe(
      "https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-mac-arm64.dmg",
    );
    expect(releaseAssetUrl("lockEdge")).toBe(
      "https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-Lock-edge.zip",
    );
  });

  it("offers every file once, in the order the user listed them", () => {
    const files = DOWNLOAD_CARDS.flatMap((card) => card.files.map((file) => file.asset));
    expect(files).toEqual(["macArm64", "macX64", "winSetup", "winZip", "lockChrome", "lockEdge"]);
    expect(DOWNLOAD_CARDS.map((card) => card.id)).toEqual([
      "macArm",
      "macIntel",
      "winSetup",
      "winZip",
      "lock",
    ]);
  });
});
