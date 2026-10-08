// The retention function (WP 1.12) against the local stack: called with the secret key it removes a
// still captured 91 days ago, from Storage and from `frames`, keeps one captured 89 days ago and the flag
// events of both, and writes one `retention.run` audit row for the workspace; a caller without the
// secret key is refused. Then the scheduled path: retention_nightly (pg_cron) calls the function
// through pg_net with the project URL and the secret key from Vault, run every few seconds for the test
// instead of at 22:00 UTC, and removes the next 91-day-old still the same way.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RETENTION_CRON, RetentionOutput } from "../../packages/contracts/src/index.ts";
import { call, errorCode } from "./api.ts";
import { literal, psql } from "./db-admin.ts";
import { type FlagWithStills, flagWithStills } from "./flag-stills.ts";
import { adminClient, createWorld, type Student, stack, type World } from "./world.ts";

const DAY_MS = 86_400_000;

let world: World;
let student: Student;
let oldFlag: FlagWithStills;
let newFlag: FlagWithStills;

async function backdate(frameId: string, days: number): Promise<void> {
  const { error } = await adminClient()
    .from("frames")
    .update({ captured_at: new Date(Date.now() - days * DAY_MS).toISOString() })
    .eq("id", frameId);
  if (error) throw new Error(error.message);
}

async function stillExists(path: string): Promise<boolean> {
  const { data, error } = await adminClient().storage.from("frames").download(path);
  return error === null && data !== null;
}

async function frameExists(frameId: string): Promise<boolean> {
  const { data, error } = await adminClient().from("frames").select("id").eq("id", frameId).maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

async function runs() {
  const { data, error } = await adminClient()
    .from("audit_log")
    .select("actor_id, actor_kind, object_type, object_id, meta")
    .eq("workspace_id", world.workspaceId)
    .eq("action", "retention.run")
    .order("id");
  if (error) throw new Error(error.message);
  return data ?? [];
}

beforeAll(async () => {
  world = await createWorld({ students: 1 });
  const [first] = world.students;
  if (!first) throw new Error("need a student");
  student = first;
  oldFlag = await flagWithStills(student, "phone.detected", 1);
  newFlag = await flagWithStills(student, "gaze.off_screen", 1);
  await backdate(oldFlag.frameIds[0] ?? "", 91);
  await backdate(newFlag.frameIds[0] ?? "", 89);
});

afterAll(async () => {
  await world?.destroy();
});

describe("retention", () => {
  it("is for the secret key only", async () => {
    expect((await call("retention", {}, null)).status).toBe(401);
    for (const token of [world.office.token, world.lead.token, student.token]) {
      const reply = await call("retention", {}, token);
      expect(reply.status).toBe(401);
      expect(errorCode(reply)).toBe("unauthorized");
    }
    // Nothing was removed by the refused calls.
    expect(await stillExists(oldFlag.paths[0] ?? "")).toBe(true);
  });

  it("removes the 91-day-old still and its row, keeps the 89-day-old one and both flags", async () => {
    const reply = await call("retention", {}, null, { apikey: stack().secretKey });
    expect(reply.status).toBe(200);
    const body = RetentionOutput.parse(reply.body);
    expect(body.frames).toBeGreaterThanOrEqual(1);
    expect(body.stills).toBeGreaterThanOrEqual(1);
    expect(body.workspaces).toBeGreaterThanOrEqual(1);

    expect(await stillExists(oldFlag.paths[0] ?? "")).toBe(false);
    expect(await frameExists(oldFlag.frameIds[0] ?? "")).toBe(false);
    expect(await stillExists(newFlag.paths[0] ?? "")).toBe(true);
    expect(await frameExists(newFlag.frameIds[0] ?? "")).toBe(true);
    // Events stay: retention deletes stills only; events go only on a delete request.
    const events = await adminClient()
      .from("events")
      .select("id")
      .in("id", [oldFlag.eventId, newFlag.eventId]);
    expect(events.data).toHaveLength(2);

    const rows = await runs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_id: null,
      actor_kind: "service",
      object_type: "workspace",
      object_id: world.workspaceId,
      meta: { frames: 1, retention_days: 90 },
    });

    // A second run finds nothing more of this workspace and writes no second row for it.
    const again = await call("retention", {}, null, { apikey: stack().secretKey });
    expect(again.status).toBe(200);
    expect(await runs()).toHaveLength(1);
    expect(await stillExists(newFlag.paths[0] ?? "")).toBe(true);
  });

  it("runs from pg_cron through pg_net with the key from Vault", async () => {
    const existing = psql(
      "select count(*) from vault.decrypted_secrets where name in ('uki_project_url', 'uki_secret_key');",
    );
    if (existing !== "0") {
      // A stack with its own Vault secrets (a developer's) is left alone.
      console.warn("retention: the stack already has Vault secrets; the pg_cron path is not tested here");
      return;
    }
    expect(psql("select schedule from cron.job where jobname = 'retention_nightly';")).toBe(RETENTION_CRON);
    const next = await flagWithStills(student, "face.second", 1);
    await backdate(next.frameIds[0] ?? "", 91);
    const before = Number(psql("select coalesce(max(id), 0) from net._http_response;"));
    try {
      // `http://kong:8000` is the API gateway as the database container sees it on the stack's network.
      psql(`select vault.create_secret('http://kong:8000', 'uki_project_url');
        select vault.create_secret(${literal(stack().secretKey)}, 'uki_secret_key');
        select cron.alter_job((select jobid from cron.job where jobname = 'retention_nightly'), schedule := '3 seconds');`);
      const deadline = Date.now() + 45_000;
      while ((await frameExists(next.frameIds[0] ?? "")) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      psql(`select cron.alter_job((select jobid from cron.job where jobname = 'retention_nightly'), schedule := ${literal(RETENTION_CRON)});
        delete from vault.secrets where name in ('uki_project_url', 'uki_secret_key');`);
    }
    expect(psql("select schedule from cron.job where jobname = 'retention_nightly';")).toBe(RETENTION_CRON);
    expect(await frameExists(next.frameIds[0] ?? "")).toBe(false);
    expect(await stillExists(next.paths[0] ?? "")).toBe(false);
    expect(await stillExists(newFlag.paths[0] ?? "")).toBe(true);
    // pg_net recorded the function's answer: 200 with the counts.
    const answered = psql(
      `select status_code || '|' || content from net._http_response where id > ${before} and status_code = 200 order by id limit 1;`,
    );
    expect(answered.startsWith("200|")).toBe(true);
    expect(RetentionOutput.parse(JSON.parse(answered.slice(4))).frames).toBeGreaterThanOrEqual(1);
    const rows = await runs();
    expect(rows.at(-1)?.meta).toMatchObject({ frames: 1, retention_days: 90 });
  }, 90_000);
});
