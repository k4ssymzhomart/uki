// `pnpm seed:term`: writes seed v2's Autumn 2026 term data (scripts/lib/seed-v2/sql.ts) into
// supabase/seed.sql between its marker lines. Run it after changing the generator.
//   --check   exit 1 when seed.sql's block differs from the generator's, without writing
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/paths.ts";
import { spliceTermData, termDataSql } from "./lib/seed-v2/sql.ts";
import { buildTermPlan } from "./lib/seed-v2/term.ts";

const SEED = join(ROOT, "supabase", "seed.sql");

const current = readFileSync(SEED, "utf8");
const next = spliceTermData(current, termDataSql(buildTermPlan()));
if (process.argv.includes("--check")) {
  if (next !== current) {
    console.error("seed:term: supabase/seed.sql's term data is out of date; run pnpm seed:term");
    process.exit(1);
  }
  console.log("seed:term: supabase/seed.sql's term data is up to date");
} else if (next === current) {
  console.log("seed:term: supabase/seed.sql's term data was already up to date");
} else {
  writeFileSync(SEED, next);
  console.log("seed:term: wrote the term data into supabase/seed.sql");
}
