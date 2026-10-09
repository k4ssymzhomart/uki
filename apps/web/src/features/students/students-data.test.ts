import { describe, expect, it } from "vitest";
import type { AnyClient } from "../wall/queries.ts";
import { loadStudentProfile, loadStudents } from "./students-data.ts";

type Call = { table: string; ops: [string, unknown[]][] };
type Answer = { data: unknown; error: { message: string } | null };

/**
 * A PostgREST client that records every query (table and builder calls) and answers each table from
 * `tables`, and every rpc from `rpc`. Enough for the reads of students-data.ts.
 */
function fakeClient(
  tables: Record<string, (call: Call) => Answer>,
  rpc: (name: string, args: unknown) => Answer,
) {
  const calls: Call[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      // The answer is worked out after the synchronous builder calls, when the query is awaited.
      const result = Promise.resolve().then(() =>
        (tables[table] ?? (() => ({ data: [], error: null })))(call),
      );
      const builder = Object.assign(result, {}) as Promise<Answer> & Record<string, unknown>;
      for (const op of ["select", "eq", "gt", "in", "order", "range", "limit", "maybeSingle"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      return builder;
    },
    rpc(name: string, args: unknown) {
      rpcs.push({ name, args });
      return Promise.resolve(rpc(name, args));
    },
  };
  return { client: client as unknown as AnyClient, calls, rpcs };
}

const ok = (data: unknown): Answer => ({ data, error: null });
const STUDENT = {
  id: "b0000000-0000-4000-8000-000020231187",
  student_number: "20231187",
  full_name: "Madina Tulegenova",
  group_id: "a2000000-0000-4000-8000-000000000204",
  group_code: "204",
  faculty_id: "a1000000-0000-4000-8000-000000000001",
  programme: null,
  year: null,
  exams_taken: 1,
  flags: 0,
  sessions_in_review: 0,
  last_exam_id: null,
  last_exam_title: null,
  last_exam_at: null,
  latest_decision: null,
  locale: "kk",
};
const SESSION = "5e000000-0000-4000-8000-000000000001";

describe("A.2 and A.3 reads", () => {
  it("writes one students.list audit row, then reads the faculty's students and this term's flagged", async () => {
    const fake = fakeClient(
      {
        student_overview: () => ok([STUDENT, { ...STUDENT, id: "b0000000-0000-4000-8000-000020230912" }]),
        term_sessions: () => ok([{ session_id: SESSION }]),
        sessions: () => ok([{ student_id: STUDENT.id }]),
      },
      () => ok(null),
    );
    const data = await loadStudents(fake.client, STUDENT.faculty_id, Date.parse("2026-10-08T06:00:00Z"));
    expect(fake.rpcs).toEqual([
      { name: "audit_read", args: { action: "students.list", object_type: "student" } },
    ]);
    expect(data.rows).toHaveLength(2);
    expect(data.flaggedThisTerm).toEqual([STUDENT.id]);
    const overview = fake.calls.find((call) => call.table === "student_overview");
    expect(overview?.ops).toContainEqual(["eq", ["faculty_id", STUDENT.faculty_id]]);
    const term = fake.calls.find((call) => call.table === "term_sessions");
    expect(term?.ops).toContainEqual(["eq", ["term", "2026-autumn"]]);
    expect(term?.ops).toContainEqual(["gt", ["flags", 0]]);
  });

  it("shows nothing when the audit row cannot be written", async () => {
    const fake = fakeClient({ student_overview: () => ok([STUDENT]) }, () => ({
      data: null,
      error: { message: "forbidden" },
    }));
    await expect(loadStudents(fake.client, null, Date.now())).rejects.toThrow("audit_read students.list");
    expect(fake.calls).toEqual([]);
  });

  it("fails rather than showing a partial list when a read errors", async () => {
    const fake = fakeClient(
      { student_overview: () => ({ data: null, error: { message: "statement timeout" } }) },
      () => ok(null),
    );
    await expect(loadStudents(fake.client, null, Date.now())).rejects.toThrow("student_overview");
  });

  it("writes one student.read audit row for the profile and reads its sessions' flags, decisions and stills", async () => {
    const fake = fakeClient(
      {
        student_overview: () => ok(STUDENT),
        sessions: () =>
          ok([
            {
              id: SESSION,
              exam_id: "e0000000-0000-4000-8000-000000000001",
              state: "ready",
              joined_at: "2026-10-09T04:40:00+00:00",
              last_seen_at: null,
              time_used_s: 0,
              device: { os: "macos", app_version: "0.1.0" },
              rules_accepted_at: "2026-10-09T04:58:00+00:00",
              rules_locale: "kk",
              exams: {
                title: "Mathematics 2 · Midterm",
                course: "Mathematics 2",
                starts_at: "2026-10-09T05:00:00+00:00",
                duration_min: 90,
              },
            },
          ]),
        workspaces: () =>
          ok({
            settings: {
              retention_days: 30,
              lobby_minutes: 20,
              default_duration_min: 90,
              default_checks: {
                gaze_s: 2,
                phone_score: 0.55,
                face_missing_s: 10,
                identity: true,
                lock: true,
              },
            },
          }),
        events: () => ok([{ session_id: SESSION, received_at: "2026-10-09T05:20:00+00:00" }]),
        review_decisions: () => ok([]),
        frames: () => ok([{ session_id: SESSION, captured_at: "2026-10-09T05:20:00+00:00" }]),
      },
      () => ok(null),
    );
    const profile = await loadStudentProfile(fake.client, STUDENT.id);
    expect(fake.rpcs).toEqual([
      { name: "audit_read", args: { action: "student.read", object_type: "student", object_id: STUDENT.id } },
    ]);
    expect(profile?.student.full_name).toBe("Madina Tulegenova");
    expect(profile?.sessions[0]?.rules_locale).toBe("kk");
    expect(profile?.flags).toHaveLength(1);
    expect(profile?.frames).toHaveLength(1);
    expect(profile?.retentionDays).toBe(30);
    const events = fake.calls.find((call) => call.table === "events");
    expect(events?.ops).toContainEqual(["eq", ["review", "flag"]]);
    expect(events?.ops).toContainEqual(["in", ["session_id", [SESSION]]]);
  });

  it("returns null for a student the staff member may not see", async () => {
    const fake = fakeClient({ student_overview: () => ok(null) }, () => ok(null));
    expect(await loadStudentProfile(fake.client, STUDENT.id)).toBeNull();
  });
});
