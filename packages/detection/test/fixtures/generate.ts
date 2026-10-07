// Writes the recorded signal traces to test/fixtures/<name>.json. Run from packages/detection:
//   pnpm exec tsx test/fixtures/generate.ts
// One signal per line: [at, "f", faces, yaw, pitch, outL, outR, inL, inR, down], [at, "p", score] or
// [at, "c", "lost", reason].
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TraceFixture } from "../support/trace.ts";
import { TRACES } from "./traces.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Biome's JSON layout: the outer array one row per line, each row inline. */
export function serialize(fixture: TraceFixture): string {
  const { signals, ...head } = fixture;
  const lines = Object.entries(head).map(
    ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`,
  );
  const rows = signals.map((row) => `    ${JSON.stringify(row).replaceAll(",", ", ")}`);
  return `{\n${lines.join("\n")}\n  "signals": [\n${rows.join(",\n")}\n  ]\n}\n`;
}

for (const [name, build] of Object.entries(TRACES)) {
  const fixture = build();
  await writeFile(join(HERE, `${name}.json`), serialize(fixture));
  process.stdout.write(`${name}.json: ${fixture.signals.length} signals, ${fixture.durationMs} ms\n`);
}
