// Runs once before the integration project: finds the local stack and checks that the Edge
// Functions are being served (`pnpm functions:serve`), then hands the stack to the tests via inject().
import type { TestProject } from "vitest/node";
import { readStackEnv, type StackEnv } from "./stack.ts";

declare module "vitest" {
  export interface ProvidedContext {
    stack: StackEnv;
  }
}

export const FUNCTIONS = ["ingest", "frames", "command", "stills", "send-invites"] as const;

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
  for (const name of FUNCTIONS) {
    // Without a token every function answers 401. Anything else is a runtime that is (re)starting,
    // still fetching npm packages, or not serving at all: retry until the deadline.
    const url = `${stack.apiUrl}/functions/v1/${name}`;
    let status = await probe(url);
    while (status !== 401 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      status = await probe(url);
    }
    if (status !== 401) {
      throw new Error(
        `integration: functions/v1/${name} answered ${status ?? "nothing"} without a token, expected 401. ` +
          "Start the local stack (`supabase start`) and the functions (`pnpm functions:serve`, in another terminal).",
      );
    }
  }
  project.provide("stack", stack);
}
