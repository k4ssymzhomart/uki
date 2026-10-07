// The app's one Supabase client: the project URL and the publishable key from the build, nothing
// else. The student signs in anonymously once; supabase-js keeps the session in localStorage of the
// uki://app origin, so after a crash or restart the same user comes back and join_exam returns the
// same session ("Student flow" in docs/phase-0-plan.md).
import { createUkiClient, type UkiClient } from "@uki/db";
import { getRendererEnv, type RendererEnv } from "../lib/env.ts";
import { ServiceError, toServiceError } from "./errors.ts";

/** Where supabase-js keeps the anonymous session on this laptop. */
export const AUTH_STORAGE_KEY = "uki-student-auth";

export interface StudentClient {
  client: UkiClient;
  env: RendererEnv;
}

let shared: StudentClient | null = null;

/** Makes the client (once per renderer). Throws when the build lacks the URL or the publishable key. */
export function getStudentClient(): StudentClient {
  if (shared) return shared;
  const env = getRendererEnv();
  shared = { client: createStudentClient(env), env };
  return shared;
}

export function createStudentClient(env: RendererEnv, storage?: Storage): UkiClient {
  return createUkiClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
      ...(storage ? { storage } : {}),
    },
  });
}

/**
 * The anonymous user for this laptop: the stored session when there is one, otherwise a new anonymous
 * sign-in. Returns the user id and a current access token.
 */
export async function ensureStudentSession(
  client: UkiClient,
): Promise<{ userId: string; accessToken: string }> {
  try {
    const { data } = await client.auth.getSession();
    if (data.session) return { userId: data.session.user.id, accessToken: data.session.access_token };
    const { data: signedIn, error } = await client.auth.signInAnonymously();
    if (error || !signedIn.session) {
      const status = error && "status" in error && typeof error.status === "number" ? error.status : 0;
      if (status === 429) throw new ServiceError("rate_limited", error?.message ?? "rate limited", 429);
      throw new ServiceError(status === 0 ? "network" : "server", error?.message ?? "no session", status);
    }
    return { userId: signedIn.session.user.id, accessToken: signedIn.session.access_token };
  } catch (error) {
    throw toServiceError(error);
  }
}

/** The current access token, refreshed by supabase-js when needed. */
export async function accessToken(client: UkiClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ServiceError("auth", "not signed in", 401);
  return token;
}
