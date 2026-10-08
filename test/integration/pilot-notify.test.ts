// pilot-notify (WP 1.13): reads one pilot_requests row, checks it with the PilotRequest contract and
// emails the team through Resend (here the stub, through RESEND_BASE_URL) to UKI_EMAIL_SINK, with the
// visitor as Reply-To. Only a secret key may call it. Then the real path: request_pilot stores a row as
// an anonymous visitor, the row's trigger calls pilot-notify through pg_net with the key from Vault, and
// the email reaches the stub; a fourth request from the address is refused and sends nothing.
//
// pilot-notify sends only to UKI_EMAIL_SINK. supabase/functions/local.env leaves it out, so in a plain
// `pnpm test:integration` the tests that send are skipped and one checks that nothing is sent without
// it; CI's stack job serves the functions again with a sink and runs this file with
// UKI_FUNCTIONS_ENV_FILE pointing at that env file.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, errorCode } from "./api.ts";
import { literal, psql } from "./db-admin.ts";
import { type ResendStub, resendStubSettings, type StubEmail, startResendStub } from "./resend-email-stub.ts";
import { adminClient, publicClient, stack } from "./world.ts";

interface SentEmail {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
}

const RUN = `${Date.now()}`;
const address = (name: string) => `pilot-it-${RUN}-${name}@kru.test`;
const sentTo = (email: string) => (sent: StubEmail) => (sent.body as SentEmail).reply_to === email;

const { apiKey, sink } = resendStubSettings();
let stub: ResendStub;

beforeAll(async () => {
  stub = await startResendStub();
});

afterAll(async () => {
  await adminClient().from("pilot_requests").delete().like("email", `pilot-it-${RUN}-%`);
  await stub?.close();
});

/** A request as Book a pilot sends it: request_pilot with the publishable key and no session. */
async function requestPilot(email: string): Promise<"ok" | "rate_limited"> {
  const { data, error } = await publicClient().rpc("request_pilot", {
    name: "Dana Akhmetova",
    email,
    university: "KRU · Kostanay",
    role: "exam_office",
    message: "Midterms, 4 groups.",
    exam_size: "from100",
    pilot_month: "2026-11",
    demo_invite: true,
  });
  expect(error).toBeNull();
  return (data as { status: "ok" | "rate_limited" }).status;
}

async function storedIds(email: string): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("pilot_requests")
    .select("id")
    .eq("email", email)
    .order("created_at");
  expect(error).toBeNull();
  return (data ?? []).map((row) => row.id);
}

const withSecretKey = () => ({ apikey: stack().secretKey });

describe("pilot-notify", () => {
  it.skipIf(sink === null)(
    "emails the team the request through Resend, with the visitor as Reply-To",
    async () => {
      const email = address("direct");
      expect(await requestPilot(email)).toBe("ok");
      const [id] = await storedIds(email);
      if (!id) throw new Error("the request was not stored");

      const reply = await call("pilot-notify", { id }, null, withSecretKey());
      expect(reply.status).toBe(200);
      const providerId = (reply.body as { id: string }).id;
      const sent = stub.emails[Number(providerId.replace("stub-", "")) - 1];
      if (!sent) throw new Error(`the stub has no email ${providerId}`);

      expect(sent.authorization).toBe(`Bearer ${apiKey}`);
      const body = sent.body as SentEmail;
      // Plain text only: no HTML, no tags, no tracking options.
      expect(Object.keys(body).sort()).toEqual(["from", "reply_to", "subject", "text", "to"]);
      expect(body.to).toEqual([sink]);
      expect(body.reply_to).toBe(email);
      expect(body.from).toContain("onboarding@resend.dev");
      expect(body.subject).toBe("Pilot request: KRU · Kostanay");
      for (const line of [
        "Name: Dana Akhmetova",
        `Work email: ${email}`,
        "University: KRU · Kostanay",
        "Role: Exam office",
        "Students in one exam: 100–300",
        "When: November 2026",
        "Demo Day invite: Yes, 16 October",
        "Midterms, 4 groups.",
        `Request ${id}.`,
      ]) {
        expect(body.text).toContain(line);
      }
    },
  );

  it("refuses every caller without a secret key and sends nothing", async () => {
    const email = address("refused");
    expect(await requestPilot(email)).toBe("ok");
    const [id] = await storedIds(email);
    const before = stub.emails.length;

    // The publishable key alone, as a visitor's browser could send it.
    const publishable = await call("pilot-notify", { id }, null);
    expect(publishable.status).toBe(401);
    expect(errorCode(publishable)).toBe("unauthorized");

    // A signed-in user's token (a student's anonymous sign-in).
    const visitor = publicClient();
    const { data: session, error } = await visitor.auth.signInAnonymously();
    expect(error).toBeNull();
    try {
      const token = session.session?.access_token ?? null;
      const user = await call("pilot-notify", { id }, token);
      expect(user.status).toBe(401);
    } finally {
      if (session.user) await adminClient().auth.admin.deleteUser(session.user.id);
    }

    // No key at all.
    const bare = await fetch(`${stack().apiUrl}/functions/v1/pilot-notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    expect(bare.status).toBe(401);
    await bare.body?.cancel();

    expect(stub.emails.length).toBe(before);
  });

  it("answers not_found for an unknown request and bad_request for a body without a request id", async () => {
    const unknown = await call(
      "pilot-notify",
      { id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a69ffff" },
      null,
      withSecretKey(),
    );
    expect(unknown.status).toBe(404);
    expect(errorCode(unknown)).toBe("not_found");
    for (const body of [{}, { id: "pilot" }]) {
      const bad = await call("pilot-notify", body, null, withSecretKey());
      expect(bad.status).toBe(400);
      expect(errorCode(bad)).toBe("bad_request");
    }
  });

  it.runIf(sink === null)("answers internal without UKI_EMAIL_SINK and sends nothing", async () => {
    const email = address("no-sink");
    expect(await requestPilot(email)).toBe("ok");
    const [id] = await storedIds(email);
    const before = stub.emails.length;
    const reply = await call("pilot-notify", { id }, null, withSecretKey());
    expect(reply.status).toBe(500);
    expect(errorCode(reply)).toBe("internal");
    expect(stub.emails.length).toBe(before);
  });

  it.skipIf(sink === null)(
    "answers internal when Resend refuses the email, and the request stays stored",
    async () => {
      const email = address("resend-error");
      expect(await requestPilot(email)).toBe("ok");
      const [id] = await storedIds(email);
      stub.failNext(422, "Invalid `to` field.");
      const reply = await call("pilot-notify", { id }, null, withSecretKey());
      expect(reply.status).toBe(500);
      expect(errorCode(reply)).toBe("internal");
      expect(await storedIds(email)).toEqual([id]);
    },
  );
});

describe.skipIf(sink === null)("the pilot_requests trigger", () => {
  it("emails each stored request through pg_net with the key from Vault, and nothing for a refused fourth", async (context) => {
    const existing = psql(
      "select count(*) from vault.secrets where name in ('uki_project_url', 'uki_secret_key');",
    );
    // A stack with its own Vault secrets (a developer's setup) is left alone.
    if (existing !== "0") context.skip();

    const before = Number(psql("select coalesce(max(id), 0) from net._http_response;"));
    // The database container reaches the API gateway as `kong` on the stack's Docker network.
    psql(
      `select vault.create_secret('http://kong:8000', 'uki_project_url');
       select vault.create_secret(${literal(stack().secretKey)}, 'uki_secret_key');`,
    );
    const email = address("trigger");
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        expect(await requestPilot(email)).toBe("ok");
        await expect
          .poll(() => stub.emails.filter(sentTo(email)).length, { timeout: 20_000, interval: 200 })
          .toBe(attempt);
      }
      const ids = await storedIds(email);
      expect(ids).toHaveLength(3);
      const texts = stub.emails.filter(sentTo(email)).map((sent) => (sent.body as SentEmail).text);
      for (const id of ids) expect(texts.some((text) => text.includes(`Request ${id}.`))).toBe(true);

      // pg_net's own record of the calls: pilot-notify answered 200 with the stub's id each time.
      const responses = psql(
        `select status_code || ' ' || content from net._http_response where id > ${before} order by id;`,
      )
        .split("\n")
        .filter((line) => line !== "");
      expect(responses.length).toBeGreaterThanOrEqual(3);
      for (const line of responses) expect(line).toMatch(/^200 \{"id":"stub-\d+"\}$/);

      // The fourth request from the address on the same day is refused, stored nowhere and emailed to no one.
      expect(await requestPilot(email)).toBe("rate_limited");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect(await storedIds(email)).toHaveLength(3);
      expect(stub.emails.filter(sentTo(email))).toHaveLength(3);
    } finally {
      psql("delete from vault.secrets where name in ('uki_project_url', 'uki_secret_key');");
    }
  });
});
