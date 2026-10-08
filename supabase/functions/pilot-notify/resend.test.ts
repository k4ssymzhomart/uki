import { describe, expect, it, vi } from "vitest";
import { ResendError, sendResendEmail } from "./resend.ts";

const EMAIL = {
  from: "Üki <onboarding@resend.dev>",
  to: "team@uki.test",
  replyTo: "dana.akhmetova@kru.test",
  subject: "Pilot request: KRU · Kostanay",
  text: "A pilot request came in through Book a pilot.",
};

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("one email through Resend", () => {
  it("posts the email with the key and returns Resend's id", async () => {
    const fetchImpl = reply(200, { id: "re_123" });
    const id = await sendResendEmail(EMAIL, { apiKey: "re_test", baseUrl: "http://stub.test/", fetchImpl });
    expect(id).toBe("re_123");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://stub.test/emails");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(String(init.body))).toEqual({
      from: EMAIL.from,
      to: ["team@uki.test"],
      subject: EMAIL.subject,
      text: EMAIL.text,
      reply_to: "dana.akhmetova@kru.test",
    });
  });

  it("throws Resend's message on a refusal and on a reply without an id", async () => {
    await expect(
      sendResendEmail(EMAIL, {
        apiKey: "re_test",
        fetchImpl: reply(403, { message: "domain not verified" }),
      }),
    ).rejects.toEqual(new ResendError(403, "domain not verified"));
    await expect(
      sendResendEmail(EMAIL, { apiKey: "re_test", fetchImpl: reply(200, {}) }),
    ).rejects.toBeInstanceOf(ResendError);
  });
});
