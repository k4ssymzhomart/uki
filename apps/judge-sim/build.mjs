// Builds the judge simulator into one folder for the VPS: dist/judge-sim/ with judge-sim.mjs (one ESM
// file with zod and the contracts inside; Node's own modules stay external), the stills, and the
// PowerShell scripts from deploy/vps. Copy that folder to the VPS and run install.ps1 there
// (docs/runbooks/judge-mode.md). No monorepo install on the VPS.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist", "judge-sim");
rmSync(join(here, "dist"), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, "src", "main.ts")],
  outfile: join(out, "judge-sim.mjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: false,
  sourcemap: false,
  legalComments: "eof",
  logLevel: "warning",
  // The entry check in main.ts compares import.meta.url with argv[1]; keep it working in the bundle.
  banner: {
    js: "// judge-sim: simulated students for DEMO-LIVE (Üki judge mode). Built by apps/judge-sim/build.mjs.",
  },
});

cpSync(join(here, "stills"), join(out, "stills"), { recursive: true });
const vps = join(here, "..", "..", "deploy", "vps");
for (const file of readdirSync(vps)) cpSync(join(vps, file), join(out, file));
console.log(`judge-sim: built ${out}`);
