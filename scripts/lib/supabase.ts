// Supabase clients for the scripts: the admin client (secret key, scripts only) from @uki/db, and a
// staff client signed in with email and password for calls that must run as a person (start_exam).
import { FRAMES_BUCKET } from "../../packages/contracts/src/index.ts";
import { createUkiAdminClient } from "../../packages/db/src/admin.ts";
import { createUkiClient, type UkiClient } from "../../packages/db/src/index.ts";
import type { ScriptEnv } from "./env.ts";

export type { UkiClient };

export function adminClient(env: ScriptEnv): UkiClient {
  return createUkiAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
}

/** A client signed in as a seeded staff member (scripts/seed-staff.ts), for RPCs that check the caller. */
export async function staffClient(
  env: ScriptEnv,
  email: string,
): Promise<{ client: UkiClient; userId: string; accessToken: string }> {
  if (env.SUPABASE_PUBLISHABLE_KEY === undefined || env.SEED_STAFF_PASSWORD === undefined) {
    throw new Error(
      "signing in as staff needs SUPABASE_PUBLISHABLE_KEY and SEED_STAFF_PASSWORD in the environment",
    );
  }
  const client = createUkiClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: env.SEED_STAFF_PASSWORD });
  if (error || !data.session || !data.user) {
    throw new Error(
      `staff sign-in as ${email} failed: ${error?.message ?? "no session"} (run pnpm seed:staff?)`,
    );
  }
  return { client, userId: data.user.id, accessToken: data.session.access_token };
}

const PAGE = 1000;

/** Every object path under `<prefix>/` in the frames bucket, two folder levels deep (session, file). */
export async function listFramesUnder(client: UkiClient, prefix: string): Promise<string[]> {
  const bucket = client.storage.from(FRAMES_BUCKET);
  const list = async (path: string) => {
    const entries: { name: string; id: string | null }[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(path, { limit: PAGE, offset });
      if (error) throw new Error(`storage list ${path}: ${error.message}`);
      entries.push(...data);
      if (data.length < PAGE) return entries;
    }
  };
  const paths: string[] = [];
  for (const entry of await list(prefix)) {
    // A folder has no id; a file directly under the prefix has one.
    if (entry.id !== null) {
      paths.push(`${prefix}/${entry.name}`);
      continue;
    }
    for (const file of await list(`${prefix}/${entry.name}`)) {
      if (file.id !== null) paths.push(`${prefix}/${entry.name}/${file.name}`);
    }
  }
  return paths;
}

/** Removes `paths` from the frames bucket, 100 at a time. Returns how many were removed. */
export async function removeFrames(client: UkiClient, paths: readonly string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { data, error } = await client.storage.from(FRAMES_BUCKET).remove(chunk);
    if (error) throw new Error(`storage remove: ${error.message}`);
    removed += data.length;
  }
  return removed;
}
