import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extensionIdFromManifestKey } from "../../apps/lock/src/lib/extension-id.ts";
import {
  assetFacts,
  formatMegabytes,
  lockPairing,
  pickSource,
  RELEASE_ASSETS,
  releaseDirProblems,
  releaseNotes,
  stagePlatform,
} from "./release.ts";

const NAMES = [
  "Uki-mac-arm64.dmg",
  "Uki-mac-x64.dmg",
  "Uki-Setup-win-x64.exe",
  "Uki-win-x64.zip",
  "Uki-Lock-chrome.zip",
  "Uki-Lock-edge.zip",
];

const asset = (name: string) => {
  const found = RELEASE_ASSETS.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(name);
  return found;
};

let temp: string | undefined;
afterEach(async () => {
  if (temp !== undefined) await rm(temp, { recursive: true, force: true });
  temp = undefined;
});

async function tempDir(): Promise<string> {
  temp = await mkdtemp(join(tmpdir(), "uki-release-"));
  return temp;
}

describe("RELEASE_ASSETS", () => {
  it("publishes the six stable names, each once and with no version in it", () => {
    expect(RELEASE_ASSETS.map((entry) => entry.name)).toEqual(NAMES);
    for (const name of NAMES) expect(name).not.toMatch(/\d+\.\d+/);
  });
});

describe("pickSource", () => {
  const desktop = [
    "Uki-0.1.7-arm64.dmg",
    "Uki-0.1.7-arm64.dmg.blockmap",
    "Uki-0.1.7-x64.dmg",
    "Uki-0.1.7-x64.dmg.blockmap",
    "Uki-0.1.7-x64.exe",
    "Uki-0.1.7-x64.exe.blockmap",
    "Uki-0.1.7-x64.zip",
    "Uki-lab-0.1.7-x64.zip",
    "builder-debug.yml",
    "lab",
    "mac",
    "win-unpacked",
  ];

  it("finds each desktop file by its versioned name, never a blockmap", () => {
    expect(pickSource(asset("Uki-mac-arm64.dmg"), desktop)).toBe("Uki-0.1.7-arm64.dmg");
    expect(pickSource(asset("Uki-mac-x64.dmg"), desktop)).toBe("Uki-0.1.7-x64.dmg");
    expect(pickSource(asset("Uki-Setup-win-x64.exe"), desktop)).toBe("Uki-0.1.7-x64.exe");
  });

  it("never takes the lab zip for the Windows zip", () => {
    expect(pickSource(asset("Uki-win-x64.zip"), desktop)).toBe("Uki-0.1.7-x64.zip");
    expect(() => pickSource(asset("Uki-win-x64.zip"), ["Uki-lab-0.1.7-x64.zip"])).toThrow(/found none/);
  });

  it("finds the Lock zips from wxt zip", () => {
    const files = ["chrome-mv3", "edge-mv3", "lock-0.1.7-chrome.zip", "lock-0.1.7-edge.zip"];
    expect(pickSource(asset("Uki-Lock-chrome.zip"), files)).toBe("lock-0.1.7-chrome.zip");
    expect(pickSource(asset("Uki-Lock-edge.zip"), files)).toBe("lock-0.1.7-edge.zip");
  });

  it("refuses two candidates, so an old build left in the folder never ships by accident", () => {
    expect(() => pickSource(asset("Uki-mac-x64.dmg"), ["Uki-0.0.0-x64.dmg", "Uki-0.1.7-x64.dmg"])).toThrow(
      /Uki-0\.0\.0-x64\.dmg, Uki-0\.1\.7-x64\.dmg/,
    );
  });
});

describe("stagePlatform", () => {
  it("copies one platform's files under the stable names and leaves the others", async () => {
    const root = await tempDir();
    await mkdir(join(root, "apps/desktop/release/lab"), { recursive: true });
    await writeFile(join(root, "apps/desktop/release/Uki-0.1.7-x64.exe"), "installer");
    await writeFile(join(root, "apps/desktop/release/Uki-0.1.7-x64.zip"), "zip");
    await writeFile(join(root, "apps/desktop/release/lab/Uki-lab-0.1.7-x64.zip"), "lab");
    const out = join(root, "out");

    expect(await stagePlatform(root, "win", out)).toEqual(["Uki-Setup-win-x64.exe", "Uki-win-x64.zip"]);
    expect((await readdir(out)).sort()).toEqual(["Uki-Setup-win-x64.exe", "Uki-win-x64.zip"]);
    expect(await readFile(join(out, "Uki-win-x64.zip"), "utf8")).toBe("zip");
    await expect(stagePlatform(root, "mac", out)).rejects.toThrow(/Uki-mac-arm64\.dmg: expected one file/);
  });
});

describe("releaseDirProblems", () => {
  it("accepts exactly the six files", () => {
    expect(releaseDirProblems([...NAMES].reverse())).toEqual([]);
  });

  it("names a missing file and an extra one", () => {
    const files = [...NAMES.filter((name) => name !== "Uki-Lock-edge.zip"), "Uki-lab-0.1.7-x64.zip"];
    expect(releaseDirProblems(files)).toEqual([
      "missing Uki-Lock-edge.zip",
      "unexpected Uki-lab-0.1.7-x64.zip (only the six release files are published)",
    ]);
  });
});

describe("assetFacts and formatMegabytes", () => {
  it("measures and hashes each file in release order", async () => {
    const dir = await tempDir();
    for (const name of NAMES) await writeFile(join(dir, name), name === "Uki-win-x64.zip" ? "abc" : "x");
    const facts = await assetFacts(dir);
    expect(facts.map((fact) => fact.name)).toEqual(NAMES);
    const zip = facts.find((fact) => fact.name === "Uki-win-x64.zip");
    expect(zip).toEqual({
      name: "Uki-win-x64.zip",
      bytes: 3,
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  it("gives decimal megabytes", () => {
    expect(formatMegabytes(157_125_743)).toBe("157.1 MB");
    expect(formatMegabytes(1_225_438)).toBe("1.2 MB");
  });
});

describe("lockPairing", () => {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .publicKey.export({ type: "spki", format: "der" })
    .toString("base64");
  const id = extensionIdFromManifestKey(key);

  it("is unset when neither value is set, also when both are empty", () => {
    expect(lockPairing({})).toEqual({ state: "unset" });
    expect(lockPairing({ publicKey: "", extensionId: " " })).toEqual({ state: "unset" });
  });

  it("is paired when the id is the key's", () => {
    expect(lockPairing({ publicKey: key, extensionId: id })).toEqual({ state: "paired", extensionId: id });
  });

  it("refuses one value without the other, and an id that is not the key's", () => {
    expect(() => lockPairing({ publicKey: key })).toThrow(/VITE_LOCK_EXTENSION_ID is not/);
    expect(() => lockPairing({ extensionId: id })).toThrow(/LOCK_DEV_PUBLIC_KEY is not/);
    expect(() => lockPairing({ publicKey: key, extensionId: "a".repeat(32) })).toThrow(
      /gives the extension id/,
    );
    expect(() => lockPairing({ publicKey: key, extensionId: "not-an-id" })).toThrow(/32 letters/);
  });
});

describe("releaseNotes", () => {
  const assets = NAMES.map((name, index) => ({
    name,
    bytes: (index + 1) * 1_000_000,
    sha256: "f".repeat(64),
  }));
  const base = {
    tag: "v0.1.7",
    sha: "0123456789abcdef0123456789abcdef01234567",
    repo: "k4ssymzhomart/uki",
    assets,
  };

  it("lists every file with its stable link, what it is, its size and hash", () => {
    const notes = releaseNotes({ ...base, lock: { state: "unset" } });
    for (const entry of RELEASE_ASSETS) {
      expect(notes).toContain(
        `[\`${entry.name}\`](https://github.com/k4ssymzhomart/uki/releases/latest/download/${entry.name}) | ${entry.what} |`,
      );
    }
    expect(notes).toContain("| 6.0 MB |");
    expect(notes).toContain(`\`${"f".repeat(64)}\``);
    expect(notes).toContain("Üki v0.1.7, built from 0123456 on main");
  });

  it("has the unsigned-app steps for macOS, Windows and the Lock", () => {
    const notes = releaseNotes({ ...base, lock: { state: "unset" } });
    expect(notes).toContain("right-click (or Control-click) Üki in Applications, choose Open");
    expect(notes).toContain("Open Anyway");
    expect(notes).toContain("xattr -dr com.apple.quarantine /Applications/Uki.app");
    expect(notes).toContain("choose More info, then Run anyway");
    expect(notes).toContain("drag the zip onto that page, or unzip it and choose Load unpacked");
  });

  it("says the packaged app cannot pair when the Lock key pair is unset", () => {
    const notes = releaseNotes({ ...base, lock: { state: "unset" } });
    expect(notes).toContain("The packaged app cannot pair with Üki Lock in this release.");
    expect(notes).toContain("LOCK_DEV_PUBLIC_KEY");
  });

  it("names the fixed extension id when the pair is set", () => {
    const notes = releaseNotes({
      ...base,
      lock: { state: "paired", extensionId: "abcdefghijklmnopabcdefghijklmnop" },
    });
    expect(notes).toContain("`abcdefghijklmnopabcdefghijklmnop`");
    expect(notes).not.toContain("cannot pair");
  });

  it("refuses notes without the facts of every file", () => {
    expect(() => releaseNotes({ ...base, assets: assets.slice(1), lock: { state: "unset" } })).toThrow(
      /Uki-mac-arm64\.dmg/,
    );
  });
});
