// A stand-in for Resend's batch endpoint (POST /emails/batch), so send-invites never emails anyone in
// a test or a local run. The functions reach it through RESEND_BASE_URL, which the env file that
// `pnpm functions:serve` loads points at http://host.docker.internal:<port>; the edge runtime runs in
// Docker, so the stub listens on all interfaces on Linux (CI) and on loopback elsewhere, which Docker
// Desktop forwards. It records every batch and can refuse chosen ones, as Resend does with a 422.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { z } from "zod";
import { parseEnvLines, ROOT } from "./stack.ts";

export const StubEmail = z.looseObject({
  from: z.string(),
  to: z.array(z.string()).min(1),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});
export type StubEmail = z.infer<typeof StubEmail>;

export interface StubBatch {
  authorization: string | null;
  emails: StubEmail[];
  status: number;
  ids: string[];
}

/** What a refused batch answers: Resend's error shape. */
export interface StubRefusal {
  status: number;
  name: string;
  message: string;
}

export interface ResendStub {
  readonly batches: StubBatch[];
  /** Every email the stub accepted or refused, in order. */
  emails(): StubEmail[];
  /** Refuses the batches `refuse` picks (by their index since the last reset). */
  refuseWhen(refuse: ((index: number, emails: StubEmail[]) => StubRefusal | null) | null): void;
  reset(): void;
  close(): Promise<void>;
}

/** The settings the served functions run with: the env file `pnpm functions:serve` passes. */
export interface FunctionsEnv {
  file: string;
  port: number;
  apiKey: string;
  sink: string | null;
  webUrl: string | null;
}

/**
 * The lowest port Linux gives an outgoing connection (macOS and Windows start at 49152). A connection,
 * open or in TIME_WAIT, whose local port is the stub's makes the stub's listen() fail with EADDRINUSE,
 * as it did in CI right after the demo scripts' traffic.
 */
const EPHEMERAL_PORTS_FROM = 32768;

/** The stub's port from RESEND_BASE_URL in `file`, refused when the OS may give it to a connection. */
export function stubPort(file: string, base: URL): number {
  const port = Number(base.port);
  if (port >= EPHEMERAL_PORTS_FROM) {
    throw new Error(
      `${file}: RESEND_BASE_URL's port ${port} is one the OS gives outgoing connections; ` +
        `use a port below ${EPHEMERAL_PORTS_FROM} for the Resend stub`,
    );
  }
  return port;
}

/**
 * Reads UKI_FUNCTIONS_ENV_FILE, or supabase/functions/local.env. Refuses to go on unless
 * RESEND_BASE_URL points at this machine, so no test ever reaches the real Resend, and at a port
 * below the ephemeral range, so no outgoing connection can be holding it.
 */
export function readFunctionsEnv(): FunctionsEnv {
  const file = process.env.UKI_FUNCTIONS_ENV_FILE ?? join(ROOT, "supabase/functions/local.env");
  const vars = parseEnvLines(readFileSync(file, "utf8"));
  const base = new URL(vars.RESEND_BASE_URL ?? "https://api.resend.com");
  if (!["host.docker.internal", "localhost", "127.0.0.1"].includes(base.hostname) || base.port === "") {
    throw new Error(`${file}: RESEND_BASE_URL must point at the local Resend stub, not ${base.origin}`);
  }
  return {
    file,
    port: stubPort(file, base),
    apiKey: vars.RESEND_API_KEY ?? "",
    sink: vars.UKI_EMAIL_SINK?.trim().toLowerCase() || null,
    webUrl: vars.UKI_WEB_URL?.replace(/\/+$/, "") || null,
  };
}

export async function startResendStub(port: number): Promise<ResendStub> {
  const batches: StubBatch[] = [];
  let refuse: ((index: number, emails: StubEmail[]) => StubRefusal | null) | null = null;
  let offset = 0;

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const reply = (status: number, body: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (request.method !== "POST" || request.url !== "/emails/batch") {
        reply(404, {
          statusCode: 404,
          name: "not_found",
          message: "the stub serves POST /emails/batch only",
        });
        return;
      }
      const parsed = z
        .array(StubEmail)
        .min(1)
        .max(100)
        .safeParse(JSON.parse(Buffer.concat(chunks).toString()));
      if (!parsed.success) {
        reply(422, { statusCode: 422, name: "validation_error", message: parsed.error.message });
        return;
      }
      const index = batches.length - offset;
      const refusal = refuse?.(index, parsed.data) ?? null;
      const ids = refusal === null ? parsed.data.map(() => randomUUID()) : [];
      batches.push({
        authorization: request.headers.authorization ?? null,
        emails: parsed.data,
        status: refusal?.status ?? 200,
        ids,
      });
      if (refusal !== null) {
        reply(refusal.status, { statusCode: refusal.status, name: refusal.name, message: refusal.message });
        return;
      }
      reply(200, { data: ids.map((id) => ({ id })) });
    });
  });
  const host = process.env.UKI_RESEND_STUB_HOST ?? (process.platform === "linux" ? "0.0.0.0" : "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  return {
    batches,
    emails: () => batches.flatMap((batch) => batch.emails),
    refuseWhen(next) {
      refuse = next;
      offset = batches.length;
    },
    reset() {
      batches.length = 0;
      offset = 0;
      refuse = null;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
