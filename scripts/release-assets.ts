// The release files and notes for .github/workflows/desktop-dist.yml (WP 0.15). Run from the repo root:
//
//   pnpm release:assets stage --platform mac|win|lock --out <dir>
//       copies one platform's build output to <dir> under the stable release names (Uki-mac-arm64.dmg, …)
//   pnpm release:assets lock-key
//       checks LOCK_DEV_PUBLIC_KEY against VITE_LOCK_EXTENSION_ID (both set and matching, or neither)
//   pnpm release:assets notes --dir <dir> --tag <tag> --sha <commit> --repo <owner/name> --out <file>
//       checks that <dir> holds exactly the six release files and writes the release notes to <file>;
//       the Lock pairing paragraph follows LOCK_DEV_PUBLIC_KEY and VITE_LOCK_EXTENSION_ID
//
// Exit 1 with a readable message on any problem.
import { readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { createLogger, parseCli, UsageError } from "./lib/cli.ts";
import { ROOT } from "./lib/paths.ts";
import {
  assetFacts,
  formatMegabytes,
  lockPairing,
  releaseDirProblems,
  releaseNotes,
  stagePlatform,
} from "./lib/release.ts";

const log = createLogger("release");

const lockEnv = () => ({
  publicKey: process.env.LOCK_DEV_PUBLIC_KEY,
  extensionId: process.env.VITE_LOCK_EXTENSION_ID,
});

async function stage(argv: readonly string[]): Promise<void> {
  const args = parseCli(
    argv,
    { platform: { type: "string" }, out: { type: "string" } },
    z.object({ platform: z.enum(["mac", "win", "lock"]), out: z.string().min(1) }),
  );
  const out = resolve(args.out);
  for (const name of await stagePlatform(ROOT, args.platform, out)) log.info(`staged ${name}`);
}

function lockKey(): void {
  const pairing = lockPairing(lockEnv());
  if (pairing.state === "paired") log.info(`Üki Lock key pair set: extension id ${pairing.extensionId}`);
  else
    log.warn(
      "LOCK_DEV_PUBLIC_KEY and VITE_LOCK_EXTENSION_ID are not set: the packaged app will refuse every extension",
    );
}

async function notes(argv: readonly string[]): Promise<void> {
  const args = parseCli(
    argv,
    {
      dir: { type: "string" },
      tag: { type: "string" },
      sha: { type: "string" },
      repo: { type: "string" },
      out: { type: "string" },
    },
    z.object({
      dir: z.string().min(1),
      tag: z.string().regex(/^v\d+\.\d+\.\d+$/, "expected a tag like v0.1.7"),
      sha: z.string().regex(/^[0-9a-f]{40}$/, "expected a full commit id"),
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/name"),
      out: z.string().min(1),
    }),
  );
  const dir = resolve(args.dir);
  const problems = releaseDirProblems(await readdir(dir));
  if (problems.length > 0) throw new Error(`${dir}: ${problems.join("; ")}`);
  const assets = await assetFacts(dir);
  for (const asset of assets) log.info(`${asset.name}  ${formatMegabytes(asset.bytes)}  ${asset.sha256}`);
  const text = releaseNotes({
    tag: args.tag,
    sha: args.sha,
    repo: args.repo,
    assets,
    lock: lockPairing(lockEnv()),
  });
  await writeFile(resolve(args.out), text);
  log.info(`notes written to ${args.out}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "stage") return stage(rest);
  if (command === "lock-key") return lockKey();
  if (command === "notes") return notes(rest);
  throw new UsageError(
    "usage: release-assets <stage|lock-key|notes> [options] (see the header of this file)",
  );
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
