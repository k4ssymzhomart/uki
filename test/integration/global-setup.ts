// Runs once before the integration project: finds the local stack and checks that the Edge Functions
// are being served (`pnpm functions:serve`), then hands the stack to the tests via inject().
import type { TestProject } from "vitest/node";
import { readStackEnv, type StackEnv } from "./stack.ts";

declare module "vitest" {
  export interface ProvidedContext {
    stack: StackEnv;
  }
}

export const FUNCTIONS = ["ingest", "frames", "command", "stills", "send-invites", "pilot-notify"] as const;
/** Functions without a caller credential (`auth: "none"`): an empty body is a 400, not a 401. */
export const OPEN_FUNCTIONS = ["shared-report"] as const;

/** How long to wait for the Edge Runtime, which restarts whenever a file under supabase/functions changes. */
const READY_TIMEOUT_MS = 180_000;
const RETRY_MS = 2000;

/** Status of an unauthenticated POST, or null while the gateway or the runtime is not answering. */
async function probe(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(60_000),
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const stack = readStackEnv();
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const expected = [
    ...FUNCTIONS.map((name) => [name, 401] as const),
    ...OPEN_FUNCTIONS.map((name) => [name, 400] as const),
  ];
  for (const [name, want] of expected) {
    // Without a token every function answers 401, and an open one answers 400 to an empty body. Anything
    // else is a runtime that is (re)starting, still fetching npm packages, or not serving at all: retry
    // until the deadline.
    const url = `${stack.apiUrl}/functions/v1/${name}`;
    let status = await probe(url);
    while (status !== want && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      status = await probe(url);
    }
    if (status !== want) {
      throw new Error(
        `integration: functions/v1/${name} answered ${status ?? "nothing"} to an empty request, expected ${want}. ` +
          "Start the local stack (`supabase start`) and the functions (`pnpm functions:serve`, in another terminal).",
      );
    }
  }
  project.provide("stack", stack);
}
