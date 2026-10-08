import { DEFAULT_WORKSPACE_SETTINGS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import type { AnyClient } from "../wall/queries.ts";
import { loadAuditLog, loadPrivacyCentre, loadRequestDetail } from "./privacy-data.ts";
import { AUDIT_LIMIT } from "./privacy-model.ts";
import { AUDIT_ROWS, DELETE_REQUEST, NOW_MS, WORKSPACE, YERLAN_DELETE, YERLAN_ID } from "./test-fixtures.ts";

type Call = { table: string; ops: [string, unknown[]][] };
type Answer = { data: unknown; error: { message: string } | null; count?: number | null };

/**
 * A PostgREST client that records every query and rpc in one ordered log and answers each table from
 * `tables`, each rpc from `rpc`. Enough for the reads of privacy-data.ts.
 */
function fakeClient(
  tables: Record<string, (call: Call) => Answer>,
  rpc: (name: string, args: unknown) => Answer,
) {
  const log: string[] = [];
  const calls: Call[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const result = Promise.resolve().then(() => {
        log.push(`from:${table}`);
        return (tables[table] ?? (() => ({ data: [], error: null })))(call);
      });
      const builder = Object.assign(result, {}) as Promise<Answer> & Record<string, unknown>;
      for (const op of [
        "select",
        "eq",
        "gt",
        "gte",
        "lt",
        "in",
        "not",
        "order",
        "limit",
        "maybeSingle",
        "single",
      ]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      return builder;
    },
    rpc(name: string, args: unknown) {
      rpcs.push({ name, args });
      log.push(`rpc:${name}`);
      return Promise.resolve(rpc(name, args));
    },
  };
  return { client: client as unknown as AnyClient, calls, rpcs, log };
}

const ok = (data: unknown, count: number | null = null): Answer => ({ data, error: null, count });
const auditOk = () => ok(null);
const SESSION = "5e000000-0000-4000-8000-000000000001";

describe("A.5 reads", () => {
  it("writes privacy_centre.read before it reads, then the requests, the rule and the latest access", async () => {
    const fake = fakeClient(
      {
        workspaces: () => ok({ id: WORKSPACE, settings: DEFAULT_WORKSPACE_SETTINGS }),
        data_requests: () => ok([YERLAN_DELETE]),
        term_kpis: () => ok({ sessions: 4912 }),
        audit_log: () => ok(AUDIT_ROWS),
        frames: () => ok(null, 1204),
        staff: () => ok([]),
      },
      auditOk,
    );
    const data = await loadPrivacyCentre(fake.client, NOW_MS);
    expect(fake.log[0]).toBe("rpc:audit_read");
    expect(fake.rpcs).toEqual([
      { name: "audit_read", args: { action: "privacy_centre.read", object_type: "data_request" } },
    ]);
    expect(data.requests).toEqual([YERLAN_DELETE]);
    expect(data.sessionsThisTerm).toBe(4912);
    expect(data.cleanup).toEqual({ at: "2026-10-12T22:00:00.000Z", frames: 1204 });
    // The next run deletes the stills captured before 90 days ahead of it.
    const frames = fake.calls.find((call) => call.table === "frames");
    expect(frames?.ops).toContainEqual(["lt", ["captured_at", "2026-07-14T22:00:00.000Z"]]);
    // Recent access leaves out the privacy centre's own reads and shows three entries.
    const audit = fake.calls.find((call) => call.table === "audit_log");
    expect(audit?.ops).toContainEqual([
      "not",
      ["action", "in", "(privacy_centre.read,data_request.read,audit.read)"],
    ]);
    expect(data.recent).toHaveLength(3);
    const kpi = fake.calls.find((call) => call.table === "term_kpis");
    expect(kpi?.ops).toContainEqual(["eq", ["term", "2026-autumn"]]);
  });

  it("shows nothing when the audit row cannot be written", async () => {
    const fake = fakeClient({}, () => ({ data: null, error: { message: "forbidden" } }));
    await expect(loadPrivacyCentre(fake.client, NOW_MS)).rejects.toThrow(/audit_read privacy_centre.read/);
    expect(fake.calls).toEqual([]);
  });
});

describe("A.5a and A.5b reads", () => {
  it("writes data_request.read with the student's id before reading what Üki keeps about them", async () => {
    const fake = fakeClient(
      {
        data_requests: (call) =>
          call.ops.some(([op]) => op === "single")
            ? ok(YERLAN_DELETE)
            : ok({ id: DELETE_REQUEST, student_id: YERLAN_ID }),
        students: (call) =>
          call.ops.some(([op]) => op === "single")
            ? ok({ id: YERLAN_ID, full_name: "Yerlan Tokhtarov", student_number: "20230877" })
            : ok({ id: YERLAN_ID }),
        sessions: () =>
          ok([
            {
              id: SESSION,
              exam_id: "e0000000-0000-4000-8000-000000000001",
              device: { os: "macos", app_version: "1.4.2" },
              identity_score: 0.93,
              rules_accepted_at: "2026-10-09T04:58:00Z",
              receipt_id: "R-1",
              last_seen_at: "2026-10-09T06:00:00Z",
              joined_at: "2026-10-09T04:50:00Z",
            },
          ]),
        frames: () => ok(null, 4),
        events: (call) =>
          ok(null, call.ops.some(([op, args]) => op === "eq" && args[0] === "review") ? 3 : 1206),
        reports: () => ok([{ verify_code: "0922YT7K" }]),
      },
      auditOk,
    );
    const detail = await loadRequestDetail(
      fake.client,
      { type: "request", requestId: DELETE_REQUEST },
      NOW_MS,
    );
    expect(fake.rpcs).toEqual([
      {
        name: "audit_read",
        args: { action: "data_request.read", object_type: "student", object_id: YERLAN_ID },
      },
    ]);
    // Only the request and the student's visibility are read before the audit row.
    const auditAt = fake.log.indexOf("rpc:audit_read");
    expect(fake.log.slice(0, auditAt)).toEqual(["from:data_requests", "from:students"]);
    expect(detail?.kind).toBe("delete");
    expect(detail?.student.full_name).toBe("Yerlan Tokhtarov");
    expect(detail?.counts).toEqual({
      exams: 1,
      frames: 4,
      frameExams: 1,
      events: 1206,
      eventExams: 1,
      flags: 3,
      identityScores: 1,
      devices: 1,
      laptops: 1,
      appVersion: "1.4.2",
      consents: 1,
      receipts: 1,
      reports: ["0922YT7K"],
    });
  });

  it("opens nothing, and writes nothing, for a request or student the caller may not see", async () => {
    const hidden = fakeClient({ data_requests: () => ok(null) }, auditOk);
    expect(
      await loadRequestDetail(hidden.client, { type: "request", requestId: DELETE_REQUEST }, NOW_MS),
    ).toBeNull();
    expect(hidden.rpcs).toEqual([]);
    const otherWorkspace = fakeClient({ students: () => ok(null) }, auditOk);
    expect(
      await loadRequestDetail(
        otherWorkspace.client,
        { type: "new", kind: "copy", studentId: YERLAN_ID },
        NOW_MS,
      ),
    ).toBeNull();
    expect(otherWorkspace.rpcs).toEqual([]);
  });

  it("dates a new request from A.3 as the database will", async () => {
    const fake = fakeClient(
      {
        students: (call) =>
          call.ops.some(([op]) => op === "single")
            ? ok({ id: YERLAN_ID, full_name: "Yerlan Tokhtarov", student_number: "20230877" })
            : ok({ id: YERLAN_ID }),
        sessions: () => ok([]),
        reports: () => ok([]),
      },
      auditOk,
    );
    const detail = await loadRequestDetail(
      fake.client,
      { type: "new", kind: "copy", studentId: YERLAN_ID },
      NOW_MS,
    );
    expect(detail?.request).toBeNull();
    expect(detail?.kind).toBe("copy");
    expect(detail?.receivedAt).toBe(new Date(NOW_MS).toISOString());
    expect(detail?.dueAt).toBe("2026-10-19T05:00:00.000Z");
    expect(fake.calls.some((call) => call.table === "data_requests")).toBe(false);
  });
});

describe("A.6 reads", () => {
  it("writes audit.read first, then reads the range and the tab's actions, newest first", async () => {
    const fake = fakeClient({ audit_log: () => ok(AUDIT_ROWS) }, auditOk);
    const log = await loadAuditLog(fake.client, { tab: "deletions", range: "30d" }, NOW_MS);
    expect(fake.log[0]).toBe("rpc:audit_read");
    expect(fake.rpcs[0]).toEqual({
      name: "audit_read",
      args: { action: "audit.read", object_type: "workspace" },
    });
    const audit = fake.calls.find((call) => call.table === "audit_log");
    expect(audit?.ops).toContainEqual(["in", ["action", ["data_request.delete", "retention.run"]]]);
    expect(audit?.ops).toContainEqual(["gte", ["at", "2026-09-12T05:00:00.000Z"]]);
    expect(audit?.ops).toContainEqual(["order", ["at", { ascending: false }]]);
    expect(audit?.ops).toContainEqual(["limit", [AUDIT_LIMIT + 1]]);
    expect(log.truncated).toBe(false);
    expect(log.entries.map((entry) => entry.action)[0]).toBe("retention.run");
  });

  it("says when the range holds more than it shows", async () => {
    const many = Array.from({ length: AUDIT_LIMIT + 1 }, (_, index) => ({
      ...(AUDIT_ROWS[1] as (typeof AUDIT_ROWS)[number]),
      id: index + 1,
      at: new Date(NOW_MS - index * 1000).toISOString(),
    }));
    const fake = fakeClient({ audit_log: () => ok(many) }, auditOk);
    const log = await loadAuditLog(fake.client, { tab: "all", range: "7d" }, NOW_MS);
    expect(log.truncated).toBe(true);
    expect(log.entries).toHaveLength(AUDIT_LIMIT);
    const audit = fake.calls.find((call) => call.table === "audit_log");
    expect(audit?.ops.some(([op]) => op === "in")).toBe(false);
  });
});
