import { describe, expect, it, vi } from "vitest";
import type { AnyClient } from "../wall/queries.ts";
import { closeHelpRequest, helpFromRow, loadHelp } from "./help-data.ts";

const ROW = {
  id: "4e100000-0000-4000-8000-000000000001",
  session_id: "5e550000-0000-4000-8000-000000000001",
  exam_id: "e0000000-0000-4000-8000-0000000000aa",
  topic: "break",
  text: null,
  created_at: "2026-10-09T05:46:00+00:00",
  reply: null,
  done_at: null,
  done_by: null,
  sessions: {
    student_id: "b0000000-0000-4000-8000-000000000001",
    students: { full_name: "Kamila Rakhimova" },
  },
};

/** A client whose reads answer `rows` and whose rpc answers `rpc`. */
function client(rows: Record<string, unknown>, rpc: (name: string, args: unknown) => unknown) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const chain = (table: string): unknown => {
    const result = { data: rows[table] ?? null, error: null };
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: typeof result) => void) => resolve(result);
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  const fake = {
    from: chain,
    rpc: vi.fn(async (name: string, args: unknown) => {
      calls.push({ name, args });
      return rpc(name, args);
    }),
  };
  return { client: fake as unknown as AnyClient, calls };
}

describe("help rows", () => {
  it("reads a row with its student as a HelpRequest", () => {
    expect(helpFromRow(ROW)).toMatchObject({
      id: ROW.id,
      topic: "break",
      student_id: ROW.sessions.student_id,
      student_name: "Kamila Rakhimova",
      text: null,
    });
    expect(helpFromRow({ ...ROW, topic: "lunch" })?.topic).toBe("technical");
    expect(helpFromRow({ ...ROW, sessions: null })).toBeNull();
  });

  it("loads the open requests, audits the read and knows whether the caller answers", async () => {
    const proctor = client({ help_requests: [ROW], proctor_assignments: { staff_id: "x" } }, () => ({
      data: null,
      error: null,
    }));
    const loaded = await loadHelp(proctor.client, ROW.exam_id, "a5000000-0000-4000-8000-000000000001");
    expect(loaded.canAnswer).toBe(true);
    expect(loaded.requests).toHaveLength(1);
    expect(proctor.calls).toEqual([
      { name: "audit_read", args: { action: "help.read", object_type: "exam", object_id: ROW.exam_id } },
    ]);

    const office = client({ help_requests: [], proctor_assignments: null }, () => ({
      data: null,
      error: null,
    }));
    const none = await loadHelp(office.client, ROW.exam_id, "a5000000-0000-4000-8000-000000000002");
    expect(none).toEqual({ requests: [], canAnswer: false });
    expect(office.calls).toEqual([]);
  });
});

describe("close_help_request", () => {
  it("sends Mark done without a reply and Reply with one, and parses the closed request", async () => {
    const closed = {
      ...ROW,
      done_at: "2026-10-09T05:50:00+00:00",
      done_by: "a5000000-0000-4000-8000-000000000001",
    };
    const { sessions: _s, ...flat } = closed;
    const answer = {
      ...flat,
      student_id: ROW.sessions.student_id,
      student_name: "Kamila Rakhimova",
      message_sent: false,
    };
    const fake = client({}, () => ({ data: answer, error: null }));
    const done = await closeHelpRequest(fake.client, { id: ROW.id });
    expect(done.ok && done.request.done_at).toBe(closed.done_at);
    await closeHelpRequest(fake.client, { id: ROW.id, reply: " Radians. " });
    expect(fake.calls.map((c) => c.args)).toEqual([{ id: ROW.id }, { id: ROW.id, reply: "Radians." }]);
  });

  it("names the refusal, and refuses an empty or overlong reply before calling", async () => {
    const forbidden = client({}, () => ({ data: null, error: { message: "forbidden", code: "42501" } }));
    expect(await closeHelpRequest(forbidden.client, { id: ROW.id })).toEqual({
      ok: false,
      code: "forbidden",
    });
    const broken = client({}, () => ({ data: { nope: true }, error: null }));
    expect(await closeHelpRequest(broken.client, { id: ROW.id })).toEqual({ ok: false, code: "internal" });
    expect(await closeHelpRequest(broken.client, { id: ROW.id, reply: "x".repeat(281) })).toEqual({
      ok: false,
      code: "bad_request",
    });
    expect(broken.calls).toHaveLength(1);
  });
});
