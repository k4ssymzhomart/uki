// Supabase clients for the e2e harness: the secret-key client that builds and removes fixtures and reads
// rows to check, staff clients signed in with the seeded password, anonymous student clients, and the
// Edge Function call the desktop app makes.
import { createUkiAdminClient } from "../../packages/db/src/admin.ts";
import { createUkiClient, type UkiClient } from "../../packages/db/src/index.ts";
import { readE2eEnv } from "./env.ts";

export type { UkiClient };

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  // Realtime checks a private join against Postgres; a loaded local stack can take over the default 10 s.
  realtime: { timeout: 30_000 },
} as const;

let admin: UkiClient | null = null;

/** Bypasses RLS: fixtures and checks only, never handed to the browser. */
export function adminClient(): UkiClient {
  if (admin) return admin;
  const env = readE2eEnv();
  admin = createUkiAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  return admin;
}

export function publicClient(): UkiClient {
  const env = readE2eEnv();
  return createUkiClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, CLIENT_OPTIONS);
}

export interface SignedInClient {
  client: UkiClient;
  userId: string;
  token: string;
}

async function finishSignIn(client: UkiClient, what: string): Promise<SignedInClient> {
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (!session) throw new Error(`e2e: no session after ${what}`);
  await client.realtime.setAuth(session.access_token);
  return { client, userId: session.user.id, token: session.access_token };
}

/** A seeded staff member signed in with SEED_STAFF_PASSWORD (counts against the sign-in rate limit). */
export async function staffClient(email: string): Promise<SignedInClient> {
  const client = publicClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: readE2eEnv().SEED_STAFF_PASSWORD,
  });
  if (error) throw new Error(`e2e: ${email} could not sign in: ${error.message}`);
  return finishSignIn(client, `signing in ${email}`);
}

/** A student's anonymous sign-in, as the desktop app does before join_exam. */
export async function anonymousClient(): Promise<SignedInClient> {
  const client = publicClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`e2e: anonymous sign-in failed: ${error.message}`);
  return finishSignIn(client, "anonymous sign-in");
}

/** One page of auth users; retried twice, as local Auth times out reaching a busy Postgres. */
async function listUsers(page: number) {
  for (let attempt = 1; ; attempt += 1) {
    const result = await adminClient().auth.admin.listUsers({ page, perPage: 200 });
    if (!result.error || attempt === 3) return result;
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
}

/** auth.users ids of the given emails (admin API), so checks can name who issued a command. */
export async function userIdsByEmail(emails: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let page = 1; page <= 20 && found.size < emails.length; page += 1) {
    const { data, error } = await listUsers(page);
    if (error) throw new Error(`e2e: listing auth users failed: ${error.message}`);
    for (const user of data.users) {
      if (user.email !== undefined && emails.includes(user.email)) found.set(user.email, user.id);
    }
    if (data.users.length < 200) break;
  }
  return found;
}

export type FunctionName = "ingest" | "frames" | "command" | "stills";

export interface FunctionReply {
  status: number;
  body: unknown;
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * POST /functions/v1/<name> with the publishable key and the caller's token, the way the apps call it.
 * `retries` re-sends on a gateway failure (the local edge runtime restarts when a function file
 * changes); use it only for idempotent calls such as ingest, which stores each event id once.
 */
export async function callFunction(
  name: FunctionName,
  body: unknown,
  token: string,
  { retries = 0 }: { retries?: number } = {},
): Promise<FunctionReply> {
  const env = readE2eEnv();
  for (let attempt = 0; ; attempt += 1) {
    let reply: FunctionReply | null = null;
    try {
      const response = await fetch(`${env.SUPABASE_URL}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // not JSON (a gateway page)
      }
      reply = { status: response.status, body: parsed };
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    if (reply && (!GATEWAY_STATUSES.has(reply.status) || attempt >= retries)) return reply;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
}

/**
 * Runs cleanup steps in order, each retried twice on an error (a loaded local stack times statements
 * out), and throws at the end naming every step that still failed, so a leftover row is never silent.
 */
export async function cleanUp(
  label: string,
  steps: readonly [string, () => PromiseLike<{ error: { message: string } | null }>][],
): Promise<void> {
  const failed: string[] = [];
  for (const [what, step] of steps) {
    for (let attempt = 1; ; attempt += 1) {
      const { error } = await step();
      if (!error) break;
      if (attempt === 3) {
        failed.push(`${what}: ${error.message}`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  if (failed.length > 0) throw new Error(`e2e: ${label} left rows behind: ${failed.join("; ")}`);
}
