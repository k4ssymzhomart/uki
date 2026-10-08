// SQL as the postgres superuser on the local stack, for what the API cannot reach: Vault secrets and
// pg_net's responses. Runs psql inside the stack's database container (supabase_db_<project_id>), as
// the CI workflow does, with the SQL on stdin so no value shows in a process list.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./stack.ts";

/** project_id from the config of the stack the CLI uses: SUPABASE_WORKDIR when set, else this repo. */
export function stackProjectId(): string {
  const workdir = process.env.SUPABASE_WORKDIR ?? ROOT;
  const config = readFileSync(join(workdir, "supabase", "config.toml"), "utf8");
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(config);
  if (!match?.[1]) throw new Error(`integration: no project_id in ${workdir}/supabase/config.toml`);
  return match[1];
}

/** Runs `sql` (one statement or several) and returns psql's unaligned, tuples-only output. */
export function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${stackProjectId()}`,
      "psql",
      "-U",
      "postgres",
      "-qtA",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 },
  ).trim();
}

/** A SQL string literal. */
export function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
