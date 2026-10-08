// Resend's batch endpoint (https://resend.com/docs/api-reference/emails/send-batch-emails): up to 100
// emails in one request, all accepted or all refused, with one id per email in order. `fetch` is passed
// in so the functions-unit tests run it without the network; RESEND_BASE_URL points it at a stub in
// tests and local runs. Nothing here asks for open or click tracking: Resend tracks only when a
// verified domain turns it on, and the invites send from a domain where it stays off.
import { z } from "zod";

export const RESEND_API = "https://api.resend.com";

export interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

const BatchReply = z.object({ data: z.array(z.object({ id: z.string().min(1) })) });
const ErrorReply = z.object({ message: z.string().min(1), name: z.string().optional() });

/** A refused or failed batch: Resend's status (0 for no answer) and its message. */
export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ResendError";
  }

  /** For `invites.error` and `failed[].error`. */
  describe(): string {
    return this.status === 0 ? `Resend: ${this.message}` : `Resend ${this.status}: ${this.message}`;
  }
}

export interface ResendOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Waits before the one retry after a 429; tests pass a stub. */
  sleep?: (ms: number) => Promise<void>;
}

/** Longest wait for Retry-After before the single retry of a rate-limited batch. */
const RETRY_AFTER_MAX_MS = 2000;

function retryDelay(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, RETRY_AFTER_MAX_MS) : 1000;
}

/**
 * Sends one batch and returns Resend's ids in the order of `emails`. A 429 is tried once more after
 * Retry-After (it means nothing was sent); any other refusal, a network error or a reply without one
 * id per email throws ResendError and nothing is retried, so no student gets the email twice.
 */
export async function sendResendBatch(
  emails: readonly ResendEmail[],
  options: ResendOptions,
): Promise<string[]> {
  if (emails.length === 0) return [];
  const { apiKey, baseUrl = RESEND_API, fetchImpl = fetch } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const url = `${baseUrl.replace(/\/+$/, "")}/emails/batch`;
  const request = () =>
    fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(emails),
    });

  let response: Response;
  try {
    response = await request();
    if (response.status === 429) {
      await response.body?.cancel();
      await sleep(retryDelay(response));
      response = await request();
    }
  } catch (error) {
    throw new ResendError(0, error instanceof Error ? error.message : String(error));
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = ErrorReply.safeParse(body);
    throw new ResendError(response.status, detail.success ? detail.data.message : `HTTP ${response.status}`);
  }
  const reply = BatchReply.safeParse(body);
  if (!reply.success || reply.data.data.length !== emails.length) {
    throw new ResendError(
      response.status,
      `Resend answered without one id for each of ${emails.length} emails`,
    );
  }
  return reply.data.data.map((entry) => entry.id);
}
