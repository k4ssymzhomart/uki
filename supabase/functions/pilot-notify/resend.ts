// One email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email), with
// fetch passed in so the functions-unit tests run it without the network. RESEND_BASE_URL points it at
// a stub in tests. Resend adds no open or click tracking unless a verified domain turns it on.
import { z } from "zod";

export const RESEND_API = "https://api.resend.com";

export interface ResendEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
}

const ResendReply = z.object({ id: z.string().min(1) });

export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

/** Sends the email and returns Resend's id; a non-2xx answer or an odd reply throws ResendError. */
export async function sendResendEmail(
  email: ResendEmail,
  {
    apiKey,
    baseUrl = RESEND_API,
    fetchImpl = fetch,
  }: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch },
): Promise<string> {
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = z.object({ message: z.string() }).safeParse(body);
    throw new ResendError(response.status, detail.success ? detail.data.message : `HTTP ${response.status}`);
  }
  const reply = ResendReply.safeParse(body);
  if (!reply.success) throw new ResendError(response.status, "Resend answered without an email id");
  return reply.data.id;
}
