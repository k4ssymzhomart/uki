// A stand-in for Resend's single-email endpoint (POST /emails,
// https://resend.com/docs/api-reference/emails/send-email) on the host, so pilot-notify's tests send no
// real email. The functions reach it through RESEND_BASE_URL from the env file they are served with
// (supabase/functions/local.env, or UKI_FUNCTIONS_ENV_FILE when they are served with another one, as
// on a second stack or with UKI_EMAIL_SINK set); this module reads the same file to know where to
// listen and which sink the functions send to.
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { isAbsolute, join } from "node:path";
import { parseEnvLines, ROOT } from "./stack.ts";

/** One POST /emails the stub received. */
export interface StubEmail {
  authorization: string | null;
  body: unknown;
}

/** The env file the functions are served with: UKI_FUNCTIONS_ENV_FILE, else supabase/functions/local.env. */
export function functionsEnvFile(): string {
  const file = process.env.UKI_FUNCTIONS_ENV_FILE ?? "supabase/functions/local.env";
  return isAbsolute(file) ? file : join(ROOT, file);
}

/**
 * The functions' Resend settings from that file: the host port the stub must listen on, the key they
 * send, and UKI_EMAIL_SINK (null when the functions run without one).
 */
export function resendStubSettings(): { port: number; apiKey: string; sink: string | null } {
  const vars = parseEnvLines(readFileSync(functionsEnvFile(), "utf8"));
  const base = new URL(vars.RESEND_BASE_URL ?? "");
  // Only ever a stub on this machine: refuse anything that could be the real API.
  if (!["host.docker.internal", "localhost", "127.0.0.1"].includes(base.hostname) || base.port === "") {
    throw new Error(`integration: RESEND_BASE_URL in ${functionsEnvFile()} is not a local stub`);
  }
  return {
    port: Number(base.port),
    apiKey: vars.RESEND_API_KEY ?? "",
    sink: vars.UKI_EMAIL_SINK?.trim() || null,
  };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class ResendStub {
  readonly emails: StubEmail[] = [];
  private failures: { status: number; message: string }[] = [];

  constructor(private readonly server: Server) {}

  /** The next request gets this error, as Resend answers one (`{ statusCode, message, name }`). */
  failNext(status: number, message: string): void {
    this.failures.push({ status, message });
  }

  /** @internal Records and answers one request. */
  async handle(request: IncomingMessage): Promise<{ status: number; body: unknown }> {
    if (request.method !== "POST" || request.url !== "/emails") {
      return { status: 404, body: { statusCode: 404, message: "Not found", name: "not_found" } };
    }
    const email: StubEmail = {
      authorization: request.headers.authorization ?? null,
      body: await readBody(request),
    };
    this.emails.push(email);
    const failure = this.failures.shift();
    if (failure) {
      return {
        status: failure.status,
        body: { statusCode: failure.status, message: failure.message, name: "validation_error" },
      };
    }
    return { status: 200, body: { id: `stub-${this.emails.length}` } };
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

/**
 * Starts the stub on the port from the functions' env file. Docker Desktop (macOS, Windows) forwards
 * host.docker.internal to the host's loopback; on Linux the containers reach the host through the
 * Docker bridge, so the stub listens on every interface there.
 */
export async function startResendStub(): Promise<ResendStub> {
  const { port } = resendStubSettings();
  let stub: ResendStub | null = null;
  const server = createServer((request, response) => {
    void (stub as ResendStub).handle(request).then(({ status, body }) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
  });
  stub = new ResendStub(server);
  const host = process.platform === "linux" ? "0.0.0.0" : "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  return stub;
}
