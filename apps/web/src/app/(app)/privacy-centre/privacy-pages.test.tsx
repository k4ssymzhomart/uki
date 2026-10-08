// Who gets A.5 and A.6 (plan, Screens: the exam office) and what each page does first: a failed staff
// lookup shows the error and reads nothing, a proctor gets a 404, and the exam office's request reads the
// drawer and the filters from the address. The two server actions refuse proctors and input that does not
// parse before they touch the database or the data-request function.

import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../../../test/render.tsx";
import { actOnRequest, recordAuditExport } from "../../../features/privacy/privacy-actions.ts";
import {
  loadAuditLog,
  loadPrivacyCentre,
  loadRequestDetail,
} from "../../../features/privacy/privacy-data.ts";
import { auditRead } from "../../../features/students/students-data.ts";
import { requireStaff, type StaffMember } from "../../../lib/auth.ts";
import { createSupabaseServerClient, type SupabaseServerClient } from "../../../lib/supabase/server.ts";
import AuditLogPage from "./audit-log/page.tsx";
import PrivacyCentrePage from "./page.tsx";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/privacy-centre",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("../../../lib/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/auth.ts")>()),
  requireStaff: vi.fn(),
}));
vi.mock("../../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("../../../features/privacy/privacy-data.ts", () => ({
  loadPrivacyCentre: vi.fn(),
  loadRequestDetail: vi.fn(),
  loadAuditLog: vi.fn(),
}));
vi.mock("../../../features/students/students-data.ts", () => ({ auditRead: vi.fn() }));

const STUDENT = "b0000000-0000-4000-8000-000020230877";
const REQUEST = "d0000000-0000-4000-8000-000000000001";
const WORKSPACE = "a0000000-0000-4000-8000-000000000001";

function staff(role: StaffMember["role"]): StaffMember {
  return {
    id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
    email: "dana.akhmetova@kru.test",
    fullName: "Dana Akhmetova",
    role,
    languages: ["ru"],
    workspaceName: "KRU · Kostanay",
    facultyName: null,
  };
}

const props = (searchParams: Record<string, string>) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve(searchParams),
});

/** next/navigation's notFound() throws an error whose digest names the 404. */
async function expectNotFound(page: Promise<unknown>): Promise<void> {
  await expect(page).rejects.toMatchObject({ digest: expect.stringContaining("404") });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A.5 and A.6 pages", () => {
  it("show the lookup error and read nothing when the staff lookup failed twice", async () => {
    vi.mocked(requireStaff).mockResolvedValue(null);
    for (const page of [
      await PrivacyCentrePage(props({ request: REQUEST }) as never),
      await AuditLogPage(props({}) as never),
    ]) {
      const { unmount } = renderWithIntl(page as ReactElement);
      expect(screen.getByRole("alert").textContent).toContain("Could not reach Üki");
      unmount();
    }
    expect(loadPrivacyCentre).not.toHaveBeenCalled();
    expect(loadRequestDetail).not.toHaveBeenCalled();
    expect(loadAuditLog).not.toHaveBeenCalled();
  });

  it("give a proctor a 404 and read nothing", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("proctor"));
    await expectNotFound(PrivacyCentrePage(props({ request: REQUEST }) as never));
    await expectNotFound(AuditLogPage(props({}) as never));
    expect(loadPrivacyCentre).not.toHaveBeenCalled();
    expect(loadRequestDetail).not.toHaveBeenCalled();
    expect(loadAuditLog).not.toHaveBeenCalled();
  });

  it("read the drawer and the filters the address names for the exam office", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as SupabaseServerClient);
    vi.mocked(loadPrivacyCentre).mockResolvedValue({} as never);
    vi.mocked(loadRequestDetail).mockResolvedValue(null);
    const centre = (await PrivacyCentrePage(
      props({ new: "delete", student: STUDENT }) as never,
    )) as ReactElement<{
      missing: boolean;
    }>;
    expect(vi.mocked(loadRequestDetail).mock.calls[0]?.[1]).toEqual({
      type: "new",
      kind: "delete",
      studentId: STUDENT,
    });
    // A request the caller may not see opens the drawer's "not available" line.
    expect(centre.props.missing).toBe(true);

    vi.mocked(loadAuditLog).mockResolvedValue({ entries: [], truncated: false });
    await AuditLogPage(props({ tab: "deletions", range: "30d", q: "Yerlan" }) as never);
    expect(vi.mocked(loadAuditLog).mock.calls[0]?.[1]).toEqual({
      tab: "deletions",
      range: "30d",
      query: "Yerlan",
    });
  });
});

describe("actOnRequest", () => {
  function client(options: {
    invoke?: { data: unknown; error: unknown };
    student?: { data: unknown; error: unknown };
    inserted?: { data: unknown; error: unknown };
  }) {
    const calls: [string, unknown[]][] = [];
    const record =
      (name: string, result?: unknown) =>
      (...args: unknown[]) => {
        calls.push([name, args]);
        return result ?? builder;
      };
    const builder = {
      select: record("select"),
      eq: record("eq"),
      insert: record("insert"),
      maybeSingle: async () => options.student ?? { data: null, error: null },
      single: async () => options.inserted ?? { data: null, error: null },
    };
    const supabase = {
      from: record("from"),
      functions: {
        invoke: async (...args: unknown[]) => {
          calls.push(["invoke", args]);
          return options.invoke ?? { data: null, error: null };
        },
      },
    };
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as SupabaseServerClient);
    return calls;
  }

  const done = {
    request: {
      id: REQUEST,
      workspace_id: WORKSPACE,
      student_id: STUDENT,
      kind: "delete",
      status: "done",
      received_at: "2026-10-07T06:00:00Z",
      due_at: "2026-10-14T06:00:00Z",
      reply: null,
      export_path: null,
      done_by: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
      done_at: "2026-10-12T05:00:00Z",
    },
    link: null,
    deleted: { stills: 4, frames: 4, events: 1206, identity_scores: 2, devices: 2 },
  };

  it("refuses a proctor, a failed lookup and input that does not parse without calling anything", async () => {
    const calls = client({});
    vi.mocked(requireStaff).mockResolvedValue(staff("proctor"));
    expect(await actOnRequest({ requestId: REQUEST, action: "delete" })).toEqual({
      ok: false,
      error: "forbidden",
      requestId: null,
    });
    vi.mocked(requireStaff).mockResolvedValue(null);
    expect((await actOnRequest({ requestId: REQUEST, action: "delete" })).ok).toBe(false);
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    expect(await actOnRequest({ requestId: "kru", action: "delete" })).toMatchObject({ error: "invalid" });
    expect(await actOnRequest({ requestId: REQUEST, action: "reply", reply: "  " })).toMatchObject({
      error: "invalid",
    });
    expect(calls).toEqual([]);
  });

  it("calls data-request for a request and returns what it deleted", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    const calls = client({ invoke: { data: done, error: null } });
    expect(await actOnRequest({ requestId: REQUEST, action: "delete" })).toEqual({
      ok: true,
      requestId: REQUEST,
      link: null,
      deleted: done.deleted,
    });
    expect(calls).toEqual([
      ["invoke", ["data-request", { body: { request_id: REQUEST, action: "delete" } }]],
    ]);
  });

  it("saves a new request from A.3 first, then acts on it", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    const calls = client({
      student: { data: { workspace_id: WORKSPACE }, error: null },
      inserted: { data: { id: REQUEST }, error: null },
      invoke: { data: done, error: null },
    });
    expect(await actOnRequest({ studentId: STUDENT, kind: "delete", action: "delete" })).toMatchObject({
      ok: true,
      requestId: REQUEST,
    });
    expect(calls).toContainEqual([
      "insert",
      [{ workspace_id: WORKSPACE, student_id: STUDENT, kind: "delete" }],
    ]);
    expect(calls.at(-1)).toEqual([
      "invoke",
      ["data-request", { body: { request_id: REQUEST, action: "delete" } }],
    ]);
  });

  it("names the function's refusal and keeps the request it saved", async () => {
    vi.mocked(requireStaff).mockResolvedValue(staff("exam_office"));
    const refused = new Response(JSON.stringify({ error: "conflict", message: "in_exam" }), { status: 409 });
    client({ invoke: { data: null, error: { context: refused } } });
    expect(await actOnRequest({ requestId: REQUEST, action: "delete" })).toEqual({
      ok: false,
      error: "in_exam",
      requestId: REQUEST,
    });
  });
});

describe("recordAuditExport", () => {
  it("writes audit.export for the exam office and refuses a proctor", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as SupabaseServerClient);
    vi.mocked(requireStaff).mockResolvedValue(staff("proctor"));
    expect(await recordAuditExport()).toEqual({ ok: false });
    expect(auditRead).not.toHaveBeenCalled();
    vi.mocked(requireStaff).mockResolvedValue(staff("admin"));
    expect(await recordAuditExport()).toEqual({ ok: true });
    expect(vi.mocked(auditRead).mock.calls[0]?.[1]).toEqual({
      action: "audit.export",
      object_type: "workspace",
    });
    vi.mocked(auditRead).mockRejectedValueOnce(new Error("audit_log: denied"));
    expect(await recordAuditExport()).toEqual({ ok: false });
  });
});
