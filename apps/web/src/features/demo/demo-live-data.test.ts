import { describe, expect, it } from "vitest";
import type { SupabaseServerClient } from "../../lib/supabase/server.ts";
import { findDemoLiveExam } from "./demo-live-data.ts";

const EXAM = "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690042";

/** The exams read as PostgREST answers it, recording the filter it was given. */
function fakeSupabase(answer: () => Promise<{ data: unknown; error: { message: string } | null }>) {
  const calls: { table?: string; columns?: string; filter?: [string, unknown] } = {};
  const builder = {
    select: (columns: string) => {
      calls.columns = columns;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      calls.filter = [column, value];
      return builder;
    },
    maybeSingle: answer,
  };
  const client = {
    from: (table: string) => {
      calls.table = table;
      return builder;
    },
  };
  return { client: client as unknown as SupabaseServerClient, calls };
}

describe("findDemoLiveExam", () => {
  it("reads only the id of the exam coded DEMO-LIVE, under the caller's RLS", async () => {
    const { client, calls } = fakeSupabase(async () => ({ data: { id: EXAM }, error: null }));
    expect(await findDemoLiveExam(client)).toEqual({ status: "found", examId: EXAM });
    expect(calls).toEqual({ table: "exams", columns: "id", filter: ["code", "DEMO-LIVE"] });
  });

  it("is missing when no row is visible", async () => {
    const { client } = fakeSupabase(async () => ({ data: null, error: null }));
    expect(await findDemoLiveExam(client)).toEqual({ status: "missing" });
  });

  it("fails on an error, a row that is not an exam id, or a throw", async () => {
    const down = fakeSupabase(async () => ({ data: null, error: { message: "upstream" } }));
    expect(await findDemoLiveExam(down.client)).toEqual({ status: "failed" });
    const odd = fakeSupabase(async () => ({ data: { id: "not-a-uuid" }, error: null }));
    expect(await findDemoLiveExam(odd.client)).toEqual({ status: "failed" });
    const thrown = fakeSupabase(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await findDemoLiveExam(thrown.client)).toEqual({ status: "failed" });
  });
});
