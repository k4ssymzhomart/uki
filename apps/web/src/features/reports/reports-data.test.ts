import { describe, expect, it } from "vitest";
import type { AnyClient } from "../wall/queries.ts";
import { loadReports, reportsAuditId } from "./reports-data.ts";
import { MATH, REVIEW_TIMES, TYPES, WEEKLY } from "./test-fixtures.ts";

type Call = { table: string; ops: [string, unknown[]][] };
type Answer = { data: unknown; error: { message: string } | null };

/** A PostgREST client that records each query and answers each table from `tables`, and rpc from `rpc`. */
function fakeClient(
  tables: Record<string, (call: Call) => Answer>,
  rpc: (name: string, args: unknown) => Answer,
) {
  const log: string[] = [];
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const result = Promise.resolve().then(() => {
        log.push(`from ${table}`);
        return (tables[table] ?? (() => ({ data: [], error: null })))(call);
      });
      const builder = Object.assign(result, {}) as Promise<Answer> & Record<string, unknown>;
      for (const op of ["select", "eq", "order", "limit"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      return builder;
    },
    rpc(name: string, args: unknown) {
      log.push(`rpc ${name}`);
      return Promise.resolve(rpc(name, args));
    },
  };
  return { client: client as unknown as AnyClient, calls, log };
}

const ok = (data: unknown): Answer => ({ data, error: null });
const NOW = Date.parse("2026-10-08T06:00:00Z");
const KPIS = {
  term: "2026-autumn",
  term_start: "2026-09-01",
  exams_run: 38,
  sessions: 4912,
  flags: 485,
  flagged_sessions: 298,
  decisions: 298,
  committee: 23,
};

function a1Tables(): Record<string, (call: Call) => Answer> {
  return {
    term_exams: () =>
      ok([
        { term: "2026-autumn", term_start: "2026-09-01" },
        { term: "2026-autumn", term_start: "2026-09-01" },
        { term: "2026-spring", term_start: "2026-02-01" },
      ]),
    term_kpis: () => ok([KPIS]),
    term_weekly_flags: () => ok(WEEKLY),
    term_flag_types: () => ok(TYPES),
    term_decisions: () => ok([{ decision: "talk", sessions: 61 }]),
    term_review_time: () => ok(REVIEW_TIMES),
  };
}

describe("A.1 reads", () => {
  it("picks the term, writes one reports.read audit row, then reads the term's five views for all faculties", async () => {
    const fake = fakeClient(a1Tables(), () => ok(null));
    const data = await loadReports(fake.client, "2026-spring", null, NOW);
    expect(data.term).toBe("2026-spring");
    expect(data.terms.map((term) => term.term)).toEqual(["2026-autumn", "2026-spring"]);
    expect(data.kpis).toMatchObject({ exams_run: 38, sessions: 4912, committee: 23 });
    expect(data.weekly).toHaveLength(6);
    expect(data.types).toHaveLength(6);
    expect(data.reviewTimes).toHaveLength(6);
    // The term list reads exams only; the audit row comes before any number of the term.
    expect(fake.log.slice(0, 2)).toEqual(["from term_exams", "rpc audit_read"]);
    for (const call of fake.calls.filter((c) => c.table !== "term_exams")) {
      expect(call.ops).toContainEqual(["eq", ["term", "2026-spring"]]);
      expect(call.ops).toContainEqual(["eq", ["all_faculties", true]]);
    }
  });

  it("reads one faculty's rows when the workspace menu chose one", async () => {
    const rpcs: unknown[] = [];
    const fake = fakeClient(a1Tables(), (_name, args) => {
      rpcs.push(args);
      return ok(null);
    });
    await loadReports(fake.client, undefined, MATH, NOW);
    expect(rpcs).toEqual([
      { action: "reports.read", object_type: "workspace", object_id: `2026-autumn:${MATH}` },
    ]);
    const kpis = fake.calls.find((call) => call.table === "term_kpis");
    expect(kpis?.ops).toContainEqual(["eq", ["all_faculties", false]]);
    expect(kpis?.ops).toContainEqual(["eq", ["faculty_id", MATH]]);
    expect(reportsAuditId("2026-autumn", null)).toBe("2026-autumn");
  });

  it("reads no number of the term when the audit row cannot be written", async () => {
    const fake = fakeClient(a1Tables(), () => ({ data: null, error: { message: "forbidden" } }));
    await expect(loadReports(fake.client, undefined, null, NOW)).rejects.toThrow("audit_read reports.read");
    expect(fake.calls.map((call) => call.table)).toEqual(["term_exams"]);
  });

  it("fails rather than showing part of the term when a view errors, and shows zeros for an empty term", async () => {
    const failing = fakeClient(
      { ...a1Tables(), term_decisions: () => ({ data: null, error: { message: "statement timeout" } }) },
      () => ok(null),
    );
    await expect(loadReports(failing.client, undefined, null, NOW)).rejects.toThrow("term_decisions");
    const empty = fakeClient({}, () => ok(null));
    const data = await loadReports(empty.client, undefined, null, NOW);
    expect(data.term).toBe("2026-autumn");
    expect(data.kpis).toEqual({
      exams_run: 0,
      sessions: 0,
      flags: 0,
      flagged_sessions: 0,
      decisions: 0,
      committee: 0,
    });
  });
});
