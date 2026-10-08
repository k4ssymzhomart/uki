// The batch call without the network: what it sends, the ids it returns, and every way a batch fails.
import { describe, expect, it, vi } from "vitest";
import { RESEND_API, type ResendEmail, ResendError, sendResendBatch } from "./resend.ts";

const EMAILS: ResendEmail[] = [
  { from: "Üki <onboarding@resend.dev>", to: ["a@kru.test"], subject: "A", html: "<p>A</p>", text: "A" },
  { from: "Üki <onboarding@resend.dev>", to: ["b@kru.test"], subject: "B", html: "<p>B</p>", text: "B" },
];

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("sendResendBatch", () => {
  it("posts the batch with the key and returns the ids in order", async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: [{ id: "id-a" }, { id: "id-b" }] }));
    const ids = await sendResendBatch(EMAILS, { apiKey: "key", baseUrl: "http://stub:1/", fetchImpl });
    expect(ids).toEqual(["id-a", "id-b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://stub:1/emails/batch");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ authorization: "Bearer key", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual(EMAILS);
  });

  it("goes to Resend's API by default and sends nothing for an empty batch", async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: [{ id: "x" }] }));
    expect(await sendResendBatch([], { apiKey: "key", fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    await sendResendBatch([EMAILS[0] as ResendEmail], { apiKey: "key", fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[0 as never]).toBe(`${RESEND_API}/emails/batch`);
  });

  it("throws Resend's message and status for a refused batch", async () => {
    const fetchImpl = async () =>
      json(422, { statusCode: 422, name: "validation_error", message: "Invalid `to` field." });
    const error = await sendResendBatch(EMAILS, { apiKey: "key", fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResendError);
    expect((error as ResendError).status).toBe(422);
    expect((error as ResendError).describe()).toBe("Resend 422: Invalid `to` field.");
  });

  it("names the status when the refusal has no message", async () => {
    const fetchImpl = async () => new Response("bad gateway", { status: 502 });
    await expect(sendResendBatch(EMAILS, { apiKey: "key", fetchImpl })).rejects.toThrow("HTTP 502");
  });

  it("reports a network failure as status 0, without retrying", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("connection refused");
    });
    const error = (await sendResendBatch(EMAILS, { apiKey: "key", fetchImpl }).catch(
      (e: unknown) => e,
    )) as ResendError;
    expect(error.status).toBe(0);
    expect(error.describe()).toBe("Resend: connection refused");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a reply without one id per email", async () => {
    const fetchImpl = async () => json(200, { data: [{ id: "only-one" }] });
    await expect(sendResendBatch(EMAILS, { apiKey: "key", fetchImpl })).rejects.toThrow(
      /one id for each of 2/,
    );
  });

  it("tries a rate-limited batch once more after Retry-After, capped at 2 s", async () => {
    const replies = [
      json(429, { message: "Too many requests" }, { "retry-after": "30" }),
      json(200, { data: [{ id: "a" }, { id: "b" }] }),
    ];
    const fetchImpl = vi.fn(async () => replies.shift() as Response);
    const sleep = vi.fn(async () => {});
    expect(await sendResendBatch(EMAILS, { apiKey: "key", fetchImpl, sleep })).toEqual(["a", "b"]);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second 429", async () => {
    const fetchImpl = vi.fn(async () => json(429, { message: "Too many requests" }));
    const error = (await sendResendBatch(EMAILS, { apiKey: "key", fetchImpl, sleep: async () => {} }).catch(
      (e: unknown) => e,
    )) as ResendError;
    expect(error.describe()).toBe("Resend 429: Too many requests");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
