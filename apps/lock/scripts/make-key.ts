// Makes the Üki Lock key pair ("Your tasks" in docs/phase-0-plan.md): prints the public key for
// LOCK_DEV_PUBLIC_KEY (the manifest's `key`, which fixes the extension id) and the derived id for
// VITE_LOCK_EXTENSION_ID (the only Origin the app's socket accepts), and writes the private key outside the
// repository. The private key is needed only to pack a .crx for a store; never commit it.
//
//   pnpm exec tsx apps/lock/scripts/make-key.ts                 (writes ~/.uki/uki-lock-key.pem)
//   pnpm exec tsx apps/lock/scripts/make-key.ts --out <file>    (another place outside the repository)
//   pnpm exec tsx apps/lock/scripts/make-key.ts --from <file>   (print the values for an existing key)
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extensionIdFromPublicKey } from "../src/lib/extension-id.ts";

const REPO = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function insideRepo(path: string): boolean {
  const rel = relative(REPO, path);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function main(): void {
  const from = option("--from");
  let pem: string;
  let written: string | null = null;
  if (from) {
    pem = readFileSync(resolve(from), "utf8");
  } else {
    const out = resolve(option("--out") ?? `${homedir()}/.uki/uki-lock-key.pem`);
    if (insideRepo(out)) throw new Error(`refusing to write the private key inside the repository: ${out}`);
    if (existsSync(out) && !process.argv.includes("--force"))
      throw new Error(`${out} exists; use --from ${out} to print its values, or --force to replace it`);
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    pem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, pem, { mode: 0o600 });
    written = out;
  }
  const der = createPublicKey(createPrivateKey(pem)).export({ type: "spki", format: "der" });
  const key = der.toString("base64");
  const id = extensionIdFromPublicKey(der);
  if (written) process.stdout.write(`private key: ${written} (keep it out of the repository)\n\n`);
  process.stdout.write("Add to the repository root's .env:\n\n");
  process.stdout.write(`LOCK_DEV_PUBLIC_KEY=${key}\nVITE_LOCK_EXTENSION_ID=${id}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
