import { describe, expect, it } from "vitest";
import {
  AUDIT_PAGE,
  actionError,
  actionIcon,
  actionMessage,
  auditCsv,
  auditCsvName,
  auditEntries,
  auditFiltersFromSearch,
  auditIds,
  auditPage,
  auditSearch,
  DEFAULT_AUDIT_FILTERS,
  deleteCount,
  deleteItems,
  drawerFromSearch,
  drawerHref,
  EMPTY_NAMES,
  firstName,
  matchesQuery,
  newRequestDue,
  nextCleanup,
  rangeStart,
  requestList,
} from "./privacy-model.ts";
import {
  AUDIT_ENTRIES,
  AUDIT_NAMES,
  AUDIT_ROWS,
  COPY_REQUEST,
  DANA_ID,
  DELETE_REQUEST,
  MADINA_ID,
  NOW_MS,
  YERLAN_DELETE,
  YERLAN_DETAIL,
  ZHANSAYA_COPY,
} from "./test-fixtures.ts";

const DAY_MS = 86_400_000;

/**
 * Every action the migrations, the Edge Functions and the dashboard write to audit_log (grep for
 * write_audit, `insert into public.audit_log`, `from("audit_log").insert` and audit_read).
 */
const WRITTEN_ACTIONS = [
  "audit.export",
  "audit.read",
  "command.add_time",
  "command.end",
  "command.message",
  "command.pause",
  "command.resume",
  "command.start",
  "data_request.copy",
  "data_request.delete",
  "data_request.read",
  "data_request.received",
  "data_request.reply",
  "exam.draft_created",
  "exam.schedule",
  "help.close",
  "help.read",
  "identity_help.read",
  "invites.send",
  "invites.test",
  "join_exam",
  "privacy_centre.read",
  "proctors.assign",
  "report.share",
  "report.share_view",
  "report.view",
  "retention.run",
  "review.decide",
  "review.queue_viewed",
  "review.session_viewed",
  "roster.import",
  "roster.view",
  "seats.change_request",
  "seats.confirm",
  "session.note",
  "settings.update",
  "start_exam",
  "still.viewed",
  "student.read",
  "students.list",
] as const;

describe("A.5 Requests", () => {
  it("lists open requests first, due soonest on top, then those answered in the last 30 days", () => {
    const done = {
      ...ZHANSAYA_COPY,
      id: "d0000000-0000-4000-8000-000000000003",
      status: "done" as const,
      done_at: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
    };
    const replied = {
      ...YERLAN_DELETE,
      id: "d0000000-0000-4000-8000-000000000004",
      status: "replied" as const,
      done_at: new Date(NOW_MS - DAY_MS).toISOString(),
    };
    const old = { ...done, id: "d0000000-0000-4000-8000-000000000005", done_at: "2026-08-01T00:00:00Z" };
    const list = requestList([done, ZHANSAYA_COPY, old, replied, YERLAN_DELETE], NOW_MS);
    expect(list.open).toBe(2);
    expect(list.rows.map((row) => row.id)).toEqual([DELETE_REQUEST, COPY_REQUEST, replied.id, done.id]);
  });

  it("reads the drawer from the address and writes it back", () => {
    expect(drawerFromSearch({ request: DELETE_REQUEST })).toEqual({
      type: "request",
      requestId: DELETE_REQUEST,
    });
    expect(drawerFromSearch({ new: "copy", student: MADINA_ID })).toEqual({
      type: "new",
      kind: "copy",
      studentId: MADINA_ID,
    });
    // Anything that does not parse opens nothing.
    expect(drawerFromSearch({ request: "1; drop table" })).toBeNull();
    expect(drawerFromSearch({ new: "erase", student: MADINA_ID })).toBeNull();
    expect(drawerFromSearch({ new: "delete" })).toBeNull();
    expect(drawerFromSearch({})).toBeNull();
    expect(drawerHref({ type: "request", requestId: DELETE_REQUEST })).toBe(
      `/privacy-centre?request=${DELETE_REQUEST}`,
    );
    expect(drawerHref({ type: "new", kind: "delete", studentId: MADINA_ID })).toBe(
      `/privacy-centre?new=delete&student=${MADINA_ID}`,
    );
  });

  it("dates a new request 7 days ahead, as the database does", () => {
    expect(newRequestDue(NOW_MS)).toBe(new Date(NOW_MS + 7 * DAY_MS).toISOString());
  });
});

describe("A.5 Retention", () => {
  it("names the next nightly run and the capture time before which stills go", () => {
    const { at, cutoff } = nextCleanup(NOW_MS, 90);
    // 22:00 UTC is 03:00 in Almaty, the same night.
    expect(at.toISOString()).toBe("2026-10-12T22:00:00.000Z");
    expect(cutoff.toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(nextCleanup(Date.parse("2026-10-12T22:00:00Z"), 30).at.toISOString()).toBe(
      "2026-10-13T22:00:00.000Z",
    );
  });
});

describe("A.5a and A.5b", () => {
  it("lists what a delete removes and keeps, with the report only when there is one", () => {
    const items = deleteItems(YERLAN_DETAIL.counts);
    expect(items).toEqual([
      { id: "frames", action: "delete" },
      { id: "events", action: "delete" },
      { id: "identity", action: "delete" },
      { id: "results", action: "keep" },
      { id: "reports", action: "keep" },
    ]);
    expect(deleteCount(items)).toBe(3);
    expect(deleteItems({ ...YERLAN_DETAIL.counts, reports: [] }).map((item) => item.id)).not.toContain(
      "reports",
    );
  });

  it("names the student by the first word of the name", () => {
    expect(firstName("  Yerlan   Tokhtarov ")).toBe("Yerlan");
    expect(firstName("")).toBe("");
  });

  it("turns the function's refusals into the drawer's messages", () => {
    expect(actionError("conflict", "in_exam")).toBe("in_exam");
    expect(actionError("conflict", "already done")).toBe("done");
    expect(actionError("forbidden", null)).toBe("forbidden");
    expect(actionError("not_found", null)).toBe("forbidden");
    expect(actionError("bad_request", "reply")).toBe("invalid");
    expect(actionError(null, null)).toBe("failed");
    expect(actionError("internal", "remove stills")).toBe("failed");
  });
});

describe("A.6 Audit log", () => {
  it("folds the stills one person opened at once into one entry and keeps every other row", () => {
    expect(AUDIT_ENTRIES.map((entry) => [entry.action, entry.count])).toEqual([
      ["retention.run", 1],
      ["settings.update", 1],
      ["report.share_view", 1],
      ["review.decide", 1],
      ["still.viewed", 3],
      ["start_exam", 1],
      ["data_request.delete", 1],
    ]);
    // Two share views at the same moment stay two rows.
    const views = AUDIT_ROWS.filter((row) => row.action === "report.share_view");
    const twice = auditEntries([...views, { ...views[0], id: 99 } as (typeof views)[number]], AUDIT_NAMES);
    expect(twice).toHaveLength(2);
  });

  it("names who did it and on what, from the names RLS let the page read", () => {
    const [retention, settings, view, decide, stills, start, deleted] = AUDIT_ENTRIES;
    expect(retention?.actor).toEqual({ kind: "system" });
    expect(retention?.object).toEqual({ kind: "workspace" });
    expect(settings?.actor).toEqual({ kind: "staff", id: DANA_ID, name: "Dana Akhmetova" });
    expect(settings?.object).toEqual({ kind: "settings" });
    expect(view?.actor).toEqual({ kind: "share" });
    expect(view?.object).toEqual({ kind: "report", code: "0917MT3P8X1Z" });
    expect(decide?.object).toEqual({ kind: "session", student: "Madina Tulegenova", exam: "Mathematics 2" });
    expect(stills?.object).toEqual(decide?.object);
    expect(start?.object).toEqual({ kind: "exam", title: "Mathematics 2", examKind: "Midterm" });
    expect(deleted?.object).toEqual({ kind: "student", student: "Madina Tulegenova" });
    // What RLS hid stays unnamed.
    const unnamed = auditEntries(AUDIT_ROWS, EMPTY_NAMES);
    expect(unnamed.find((entry) => entry.action === "review.decide")?.object).toEqual({ kind: "none" });
    expect(unnamed[1]?.actor).toEqual({ kind: "staff", id: DANA_ID, name: null });
  });

  it("collects the ids to name, valid uuids only", () => {
    const ids = auditIds([
      ...AUDIT_ROWS,
      { ...(AUDIT_ROWS[0] as (typeof AUDIT_ROWS)[number]), id: 98, object_type: "exam", object_id: "x" },
    ]);
    expect(ids.staff.length).toBe(2);
    expect(ids.sessions).toEqual(["5e000000-0000-4000-8000-000000000001"]);
    expect(ids.exams).toEqual(["e0000000-0000-4000-8000-000000000001"]);
    expect(ids.students).toEqual([MADINA_ID]);
    expect(ids.reports).toEqual(["f0000000-0000-4000-8000-000000000001"]);
  });

  it("gives every known action its message and icon, and unknown ones their stored name", () => {
    const messages = AUDIT_ENTRIES.map((entry) => actionMessage(entry));
    expect(messages).toEqual([
      { key: "retention_run", values: { count: 1204, days: 90 } },
      { key: "settings_retention", values: { before: 120, after: 90 } },
      { key: "report_share_view", values: {} },
      { key: "review_decide", values: { decision: "talk" } },
      { key: "still_viewed", values: { count: 3 } },
      { key: "start_exam", values: {} },
      { key: "data_request_delete", values: {} },
    ]);
    const entry = AUDIT_ENTRIES[1];
    if (!entry) throw new Error("fixture");
    expect(
      actionMessage({ ...entry, meta: { before: { retention_days: 90 }, after: { retention_days: 90 } } }),
    ).toEqual({ key: "settings_update", values: {} });
    expect(actionMessage({ ...entry, action: "join_exam", meta: { result: "ok" } })?.key).toBe("join_exam");
    expect(actionMessage({ ...entry, action: "join_exam", meta: { result: "bad_code" } })?.key).toBe(
      "join_exam_refused",
    );
    expect(actionMessage({ ...entry, action: "something.new" })).toBeNull();
    expect(actionIcon("data_request.delete")).toBe("trash");
    expect(actionIcon("settings.update")).toBe("sliders");
    expect(actionIcon("something.new")).toBe("info");
    expect(actionIcon("toString")).toBe("info");
    // Every action the database, the functions and the dashboard write has words.
    for (const action of WRITTEN_ACTIONS) {
      expect(actionMessage({ ...entry, action, meta: {} }), action).not.toBeNull();
    }
  });

  it("keeps the tab, range and search in the address, dropping what does not parse", () => {
    expect(auditFiltersFromSearch({})).toEqual(DEFAULT_AUDIT_FILTERS);
    expect(auditFiltersFromSearch({ tab: "deletions", range: "30d", q: "Madina" })).toEqual({
      tab: "deletions",
      range: "30d",
      query: "Madina",
    });
    expect(auditFiltersFromSearch({ tab: "secrets", range: "1y", q: ["a", "b"] })).toEqual({
      tab: "all",
      range: "7d",
      query: "a",
    });
    expect(auditSearch(DEFAULT_AUDIT_FILTERS)).toBe("");
    expect(auditSearch({ tab: "exports", range: "90d", query: " report " })).toBe(
      "?tab=exports&range=90d&q=report",
    );
    expect(rangeStart("7d", NOW_MS).toISOString()).toBe(new Date(NOW_MS - 7 * DAY_MS).toISOString());
  });

  it("matches every word of the search in any case", () => {
    expect(matchesQuery("Aigerim Sadykova Viewed 3 flagged frames Madina T.", "madina VIEWED")).toBe(true);
    expect(matchesQuery("Dana Akhmetova Changed the settings", "madina")).toBe(false);
    expect(matchesQuery("anything", "   ")).toBe(true);
  });

  it("pages 25 entries at a time", () => {
    const rows = Array.from({ length: 60 }, (_, index) => index);
    expect(auditPage(rows, 0)).toMatchObject({ page: 0, pageCount: 3, from: 1, to: AUDIT_PAGE, total: 60 });
    expect(auditPage(rows, 2)).toMatchObject({ from: 51, to: 60 });
    expect(auditPage(rows, 9).page).toBe(2);
    expect(auditPage([], 0)).toMatchObject({ from: 0, to: 0, total: 0, pageCount: 1 });
  });

  it("exports the entries shown as CSV with the page's words and Almaty times", () => {
    const entry = AUDIT_ENTRIES[4];
    if (!entry) throw new Error("fixture");
    const csv = auditCsv([
      { entry, who: "Aigerim Sadykova", action: "Viewed 3 flagged frames", object: "Madina T., Maths" },
    ]);
    expect(csv).toBe(
      "at_utc,at_almaty,actor_kind,who,action,count,what,object\r\n" +
        '2026-10-09T06:41:00Z,2026-10-09 11:41:00,staff,Aigerim Sadykova,still.viewed,3,Viewed 3 flagged frames,"Madina T., Maths"\r\n',
    );
    expect(auditCsvName(NOW_MS)).toBe("uki-audit-log-2026-10-12.csv");
  });
});
