// The share link round trip (WP 1.9): a proctor opens the report (get_report) and shares it
// (create_share, 30 days); the shared-report function, called with no credential at all, hashes the
// token, returns 3.5's payload with 5-minute still URLs that work, and writes one audit row per view; an
// expired, revoked (revoke_share, by staff of the exam), unknown or malformed token gets nothing, and no
// audit row. verify_report then confirms the 8-character code, until the report changes, and answers
// one client 10 lookups a minute (HTTP 429 after that).
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FramesResponse,
  formatVerifyCode,
  IngestResponse,
  ReportPayload,
  RevokeShareOutput,
  SHARE_TTL_DAYS,
  SharedReportResponse,
  ShareLink,
  STILL_VIEW_URL_TTL_S,
  VERIFY_LOOKUPS_PER_MINUTE,
  VerifyCode,
  VerifyReportOutput,
} from "../../packages/contracts/src/index.ts";
import { call, envelope, errorCode, TINY_JPEG } from "./api.ts";
import { adminClient, createWorld, publicClient, type Student, stack, type World } from "./world.ts";

let world: World;
let student: Student;
let reportId = "";
let verifyCode = "";
let flagId = "";
let frameId = "";

beforeAll(async () => {
  world = await createWorld({ students: 1 });
  const [first] = world.students;
  if (!first) throw new Error("need a student");
  student = first;

  // One phone flag with its still, uploaded and confirmed as the app does it.
  const event = envelope(student.sessionId, "phone.detected", { frame_count: 1 });
  flagId = event.id;
  const ingested = await call("ingest", { session_id: student.sessionId, events: [event] }, student.token);
  expect(ingested.status).toBe(200);
  const still = IngestResponse.parse(ingested.body).uploads[0]?.stills[0];
  if (!still) throw new Error("no upload URL");
  const uploaded = await student.client.storage
    .from("frames")
    .uploadToSignedUrl(still.path, still.token, TINY_JPEG, { contentType: "image/jpeg" });
  expect(uploaded.error).toBeNull();
  const confirmed = await call("frames", { event_id: event.id, paths: [still.path] }, student.token);
  frameId = FramesResponse.parse(confirmed.body).frame_ids[0] ?? "";

  const report = await world.lead.client.rpc("get_report", { session_id: student.sessionId });
  expect(report.error).toBeNull();
  const payload = ReportPayload.parse(report.data);
  reportId = payload.report?.id ?? "";
  verifyCode = payload.report?.verify_code ?? "";
});

afterAll(async () => {
  await world?.destroy();
});

/** A client of /verify as the Next.js server names it: the SHA-256 of an address, new for each test. */
function newClient(): string {
  return createHash("sha256").update(`test-${randomUUID()}`, "utf8").digest("hex");
}

async function share(): Promise<ShareLink> {
  const created = await world.lead.client.rpc("create_share", { report_id: reportId });
  expect(created.error).toBeNull();
  return ShareLink.parse(created.data);
}

async function views(shareId: string) {
  const { data, error } = await adminClient()
    .from("audit_log")
    .select("actor_id, actor_kind, action, object_type, object_id, meta")
    .eq("action", "report.share_view")
    .eq("meta->>share_id", shareId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

describe("shared-report", () => {
  it("opens with no credential, signs working 5-minute still URLs and audits every view", async () => {
    const link = await share();
    expect(link.path).toBe(`/r/${link.token}`);
    const days = (Date.parse(link.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(SHARE_TTL_DAYS - 0.01);
    expect(days).toBeLessThanOrEqual(SHARE_TTL_DAYS);
    const stored = await adminClient()
      .from("report_shares")
      .select("token_hash")
      .eq("id", link.share_id)
      .single();
    expect(stored.data?.token_hash).toBe(createHash("sha256").update(link.token, "utf8").digest("hex"));
    expect(JSON.stringify(stored.data)).not.toContain(link.token);

    // No apikey and no token: the share token is the only key.
    const { apiUrl } = stack();
    const bare = await fetch(`${apiUrl}/functions/v1/shared-report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: link.token }),
    });
    expect(bare.status).toBe(200);
    const body = SharedReportResponse.parse(await bare.json());
    expect(body.session.id).toBe(student.sessionId);
    expect(body.student.full_name).toBe(student.name);
    expect(body.report?.id).toBe(reportId);
    expect(body.report?.verify_code).toBe(verifyCode);
    expect(body.share).toMatchObject({ id: link.share_id, shared_by: world.lead.name });
    expect(body.flags.map((flag) => flag.id)).toEqual([flagId]);
    expect(body.stills).toHaveLength(1);
    expect(body.stills[0]).toMatchObject({ frame_id: frameId, event_id: flagId });

    const signed = new URL(body.stills[0]?.url ?? "");
    expect(signed.origin).toBe(new URL(apiUrl).origin);
    const image = await fetch(signed);
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer()).equals(TINY_JPEG)).toBe(true);
    // The URL's token expires STILL_VIEW_URL_TTL_S after signing.
    const jwt = signed.searchParams.get("token") ?? "";
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      iat: number;
      exp: number;
    };
    expect(claims.exp - claims.iat).toBe(STILL_VIEW_URL_TTL_S);

    const first = await views(link.share_id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      actor_id: null,
      actor_kind: "share",
      object_type: "report",
      object_id: reportId,
      meta: { share_id: link.share_id, session_id: student.sessionId },
    });
    expect(JSON.stringify(first)).not.toContain(link.token);

    expect((await call("shared-report", { token: link.token }, null)).status).toBe(200);
    expect(await views(link.share_id)).toHaveLength(2);
  });

  it("refuses an expired share with a 404 and writes no audit row", async () => {
    const link = await share();
    const expired = await adminClient()
      .from("report_shares")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", link.share_id);
    expect(expired.error).toBeNull();
    const reply = await call("shared-report", { token: link.token }, null);
    expect(reply.status).toBe(404);
    expect(reply.body).toEqual({ error: "not_found", message: "no such share" });
    expect(await views(link.share_id)).toHaveLength(0);
  });

  it("refuses a share revoked through revoke_share the same way, with an audit row for the revoke", async () => {
    const link = await share();
    expect((await call("shared-report", { token: link.token }, null)).status).toBe(200);

    // Neither a visitor nor the student may revoke it.
    const byVisitor = await publicClient().rpc("revoke_share", { share_id: link.share_id });
    expect(byVisitor.error).not.toBeNull();
    const byStudent = await student.client.rpc("revoke_share", { share_id: link.share_id });
    expect(byStudent.error?.message).toBe("forbidden");

    const revoked = await world.lead.client.rpc("revoke_share", { share_id: link.share_id });
    expect(revoked.error).toBeNull();
    const result = RevokeShareOutput.parse(revoked.data);
    expect(result).toMatchObject({ share_id: link.share_id, report_id: reportId });
    const again = RevokeShareOutput.parse(
      (await world.lead.client.rpc("revoke_share", { share_id: link.share_id })).data,
    );
    expect(Date.parse(again.revoked_at)).toBe(Date.parse(result.revoked_at));

    const audit = await adminClient()
      .from("audit_log")
      .select("actor_id, actor_kind, object_type, object_id, meta")
      .eq("action", "report.share_revoke")
      .eq("meta->>share_id", link.share_id);
    expect(audit.error).toBeNull();
    expect(audit.data).toEqual([
      {
        actor_id: world.lead.id,
        actor_kind: "staff",
        object_type: "report",
        object_id: reportId,
        meta: { share_id: link.share_id },
      },
    ]);

    const reply = await call("shared-report", { token: link.token }, null);
    expect(reply.status).toBe(404);
    expect(reply.body).toEqual({ error: "not_found", message: "no such share" });
    expect(await views(link.share_id)).toHaveLength(1);
  });

  it("refuses an unknown token with the same 404, and a malformed one as a bad request", async () => {
    const unknown = await call("shared-report", { token: "A".repeat(43) }, null);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: "not_found", message: "no such share" });
    const short = await call("shared-report", { token: "abc" }, null);
    expect(short.status).toBe(400);
    expect(errorCode(short)).toBe("bad_request");
    const hashInstead = await call("shared-report", { token_hash: "0".repeat(64) }, null);
    expect(hashInstead.status).toBe(400);
  });

  it("verify_report confirms the code for anyone, until the report changes", async () => {
    const anon = publicClient();
    const client_hash = newClient();
    expect(VerifyCode.safeParse(verifyCode).success).toBe(true);
    const intact = VerifyReportOutput.parse(
      (await anon.rpc("verify_report", { code: formatVerifyCode(verifyCode).toLowerCase(), client_hash }))
        .data,
    );
    expect(intact).toMatchObject({ found: true, code: verifyCode, intact: true });

    const note = await world.lead.client.rpc("add_session_note", {
      session_id: student.sessionId,
      text: "Phone face down after the warning.",
    });
    expect(note.error).toBeNull();
    const changed = VerifyReportOutput.parse(
      (await anon.rpc("verify_report", { code: verifyCode, client_hash })).data,
    );
    expect(changed).toMatchObject({ found: true, intact: false });

    // The next view issues the new version; the old printout's code no longer exists.
    const link = await share();
    const opened = SharedReportResponse.parse(
      (await call("shared-report", { token: link.token }, null)).body,
    );
    expect(opened.notes).toHaveLength(1);
    const fresh = opened.report?.verify_code ?? "";
    expect(fresh).not.toBe(verifyCode);
    expect(VerifyCode.safeParse(fresh).success).toBe(true);
    expect(
      VerifyReportOutput.parse((await anon.rpc("verify_report", { code: verifyCode, client_hash })).data),
    ).toEqual({ found: false });
    expect(
      VerifyReportOutput.parse((await anon.rpc("verify_report", { code: fresh, client_hash })).data),
    ).toMatchObject({ found: true, intact: true });
  });

  it("verify_report answers a client 10 lookups a minute, then 429 rate_limited", async () => {
    const anon = publicClient();
    const client_hash = newClient();
    for (let lookup = 1; lookup <= VERIFY_LOOKUPS_PER_MINUTE; lookup += 1) {
      const answer = await anon.rpc("verify_report", { code: "UKI-0000-0000", client_hash });
      expect(answer.error).toBeNull();
      expect(answer.data).toEqual({ found: false });
    }
    const refused = await anon.rpc("verify_report", { code: formatVerifyCode(verifyCode), client_hash });
    expect(refused.status).toBe(429);
    expect(refused.error?.message).toBe("rate_limited");
    expect(Number(refused.error?.details)).toBeGreaterThan(0);
    expect(Number(refused.error?.details)).toBeLessThanOrEqual(60);

    // Another client is still answered, and nobody but the function reads the lookups.
    const other = await anon.rpc("verify_report", { code: "UKI-0000-0000", client_hash: newClient() });
    expect(other.error).toBeNull();
    const table = await anon.from("verify_lookups").select("client_hash");
    expect(table.error).not.toBeNull();
    const bad = await anon.rpc("verify_report", { code: "UKI-0000-0000", client_hash: "203.0.113.7" });
    expect(bad.error?.message).toBe("bad_request");
  });
});
