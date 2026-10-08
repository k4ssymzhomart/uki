import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { AuditLogView } from "./audit-log-view.tsx";
import { PrivacyCentreView } from "./privacy-centre-view.tsx";
import { DEFAULT_AUDIT_FILTERS } from "./privacy-model.ts";
import {
  AUDIT_ENTRIES,
  CENTRE,
  COPY_REQUEST,
  DANA_ID,
  DELETE_REQUEST,
  NOW_MS,
  YERLAN_DELETE,
  YERLAN_DETAIL,
  YERLAN_ID,
  ZHANSAYA_COPY,
  ZHANSAYA_DETAIL,
} from "./test-fixtures.ts";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/image", () => import("../../../test/next-image-mock.tsx"));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    scroll: _scroll,
    ...props
  }: {
    href: string;
    prefetch?: boolean;
    scroll?: boolean;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("./privacy-actions.ts", () => ({ actOnRequest: vi.fn(), recordAuditExport: vi.fn() }));
vi.mock("../settings/settings-actions.ts", () => ({ saveWorkspaceSettings: vi.fn() }));

afterEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
});

function expectClean() {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(document.body)).toEqual([]);
}

function centre(props: Partial<Parameters<typeof PrivacyCentreView>[0]> = {}) {
  return renderWithIntl(
    <PrivacyCentreView
      data={CENTRE}
      detail={null}
      missing={false}
      me={DANA_ID}
      nowMs={NOW_MS}
      act={vi.fn()}
      save={vi.fn()}
      {...props}
    />,
    DANA,
  );
}

describe("A.5 Privacy centre", () => {
  it("draws the banner, the data map, recent access, retention and the requests", () => {
    centre();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Admin / Privacy");
    expect(text).toContain("Video never leaves student laptops.");
    expect(text).toContain("0 MB uploaded this term. 4,912 sessions checked on device.");
    const map = [...document.querySelectorAll("tr[data-map-row]")].map((row) => row.textContent);
    expect(map).toEqual([
      "Webcam videoStudent laptop onlyNot storedNo one",
      "Face matchStudent laptopDeleted after checkNo one",
      "Flagged framesÜki server · Frankfurt90 daysProctor, exam office",
      "Event logÜki server · FrankfurtUntil a delete requestProctor, exam office",
      "AudioNot recorded——",
      "Integrity reportsExam officeWith the exam resultCommittee, on request",
    ]);
    // Recent access: the three newest staff entries, in Almaty time.
    const recent = [...document.querySelectorAll("li[data-audit-id]")].map((row) => row.textContent);
    expect(recent).toEqual([
      "9 Oct · 15:10DADana AkhmetovaChanged retention from 120 to 90 days",
      "9 Oct · 11:52ASAigerim SadykovaDecided: talk to the student",
      "9 Oct · 11:41ASAigerim SadykovaViewed 3 flagged frames",
    ]);
    expect(screen.getByRole("link", { name: /Open audit log/ }).getAttribute("href")).toBe(
      "/privacy-centre/audit-log",
    );
    expect(text).toContain("Next cleanup tonight, 03:00 · 1,204 frames.");
    // Requests: the delete due first, then the copy, each opening its drawer.
    const requests = [...document.querySelectorAll("li[data-request-id]")];
    expect(requests.map((row) => row.getAttribute("data-request-id"))).toEqual([
      DELETE_REQUEST,
      COPY_REQUEST,
    ]);
    expect(requests[0]?.textContent).toContain("Delete my dataYerlan Tokhtarov · due 14 Oct");
    expect(requests[1]?.textContent).toContain("Copy of my dataZhansaya Omarova · due 16 Oct");
    expect(
      within(requests[0] as HTMLElement)
        .getByRole("link", { name: /Review/ })
        .getAttribute("href"),
    ).toBe(`/privacy-centre?request=${DELETE_REQUEST}`);
    // Phase 2: the processing record (A.5c); no setting holds the reports' retention.
    expect(text).not.toContain("Processing record");
    expect(text).not.toContain("Integrity reports1 year");
    expect(screen.queryByRole("dialog")).toBeNull();
    expectClean();
  });

  it("saves a new retention rule, and puts it back when the save is refused", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, settings: { ...CENTRE.settings, retention_days: 30 } })
      .mockResolvedValueOnce({ ok: false, error: "forbidden" });
    centre({ save });
    const select = screen.getByRole("combobox", { name: "Flagged frames" });
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole("option", { name: "30 days" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0].settings.retention_days).toBe(30);
    await screen.findByText("Retention saved");
    expect(router.refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "Flagged frames" }));
    fireEvent.click(await screen.findByRole("option", { name: "180 days" }));
    await screen.findByText("Only the exam office can change retention.");
    expect(screen.getByRole("combobox", { name: "Flagged frames" }).textContent).toContain("30 days");
  });
});

describe("A.5a Delete request", () => {
  it("lists what goes and what stays, and deletes through the data-request function", async () => {
    const act = vi.fn().mockResolvedValue({ ok: true, requestId: DELETE_REQUEST, link: null, deleted: null });
    centre({ detail: YERLAN_DETAIL, act });
    const drawer = screen.getByRole("dialog", { name: "Delete request" });
    expect(drawer.textContent).toContain("Yerlan Tokhtarov · 20230877");
    expect(drawer.textContent).toContain("Asked on 7 Oct");
    expect(drawer.textContent).toContain("Due 14 Oct");
    expect(drawer.textContent).toContain("What Üki keeps about Yerlan");
    const items = [...drawer.querySelectorAll("li[data-item]")].map((row) => row.textContent);
    expect(items).toEqual([
      "Flagged frames4 frames from 2 examsDelete",
      "Event log1,206 events from 2 examsDelete",
      "Identity scores and devices2 card match scores, 2 device recordsDelete",
      "Answers and receipts2 exams. Kept as the exam result.Keep",
      "Integrity reportUKI-0922-YT7K. Kept with the exam result.Keep",
    ]);
    expect(drawer.textContent).toContain("The audit log keeps a record, not the data");
    fireEvent.click(within(drawer).getByRole("button", { name: "Delete 3 items" }));
    await waitFor(() => expect(act).toHaveBeenCalledWith({ requestId: DELETE_REQUEST, action: "delete" }));
    await screen.findByText("The data was deleted.");
    expect(router.refresh).toHaveBeenCalled();
    expectClean();
  });

  it("answers with a reason instead", async () => {
    const act = vi.fn().mockResolvedValue({ ok: true, requestId: DELETE_REQUEST, link: null, deleted: null });
    centre({ detail: YERLAN_DETAIL, act });
    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: "Reply with a reason" }));
    const send = within(drawer).getByRole("button", { name: "Send reply" }) as HTMLButtonElement;
    expect(send.getAttribute("aria-disabled") === "true" || send.disabled).toBe(true);
    fireEvent.change(within(drawer).getByRole("textbox", { name: "Reason for the student" }), {
      target: { value: "  The appeal is still open.  " },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Send reply" }));
    await waitFor(() =>
      expect(act).toHaveBeenCalledWith({
        requestId: DELETE_REQUEST,
        action: "reply",
        reply: "The appeal is still open.",
      }),
    );
    await screen.findByText("Reply saved.");
  });

  it("says why the function refused", async () => {
    const act = vi.fn().mockResolvedValue({ ok: false, error: "in_exam", requestId: DELETE_REQUEST });
    centre({ detail: YERLAN_DETAIL, act });
    fireEvent.click(screen.getByRole("button", { name: "Delete 3 items" }));
    await screen.findByText("Yerlan is writing an exam now. Delete the data once it ends.");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("saves a request from A.3 with its first action, then opens it", async () => {
    const act = vi.fn().mockResolvedValue({ ok: true, requestId: DELETE_REQUEST, link: null, deleted: null });
    centre({
      detail: {
        ...YERLAN_DETAIL,
        target: { type: "new", kind: "delete", studentId: YERLAN_ID },
        request: null,
      },
      act,
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete 3 items" }));
    await waitFor(() =>
      expect(act).toHaveBeenCalledWith({ studentId: YERLAN_ID, kind: "delete", action: "delete" }),
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/privacy-centre?request=${DELETE_REQUEST}`, {
        scroll: false,
      }),
    );
  });

  it("shows who answered a done request, and offers nothing more", () => {
    centre({
      detail: {
        ...YERLAN_DETAIL,
        request: {
          ...YERLAN_DELETE,
          status: "done",
          done_at: "2026-10-10T06:00:00Z",
          done_by: DANA_ID,
        },
        doneBy: "Dana Akhmetova",
      },
    });
    const drawer = screen.getByRole("dialog");
    expect(drawer.textContent).toContain("Done 10 Oct");
    expect(drawer.textContent).toContain("Deleted on request");
    expect(drawer.textContent).toContain("Dana Akhmetova deleted the data on 10 Oct.");
    expect(within(drawer).queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(within(drawer).queryByRole("button", { name: "Reply with a reason" })).toBeNull();
  });

  it("closes without reading again: the address loses the request", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    centre({ detail: YERLAN_DETAIL });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replace).toHaveBeenCalledWith(null, "", "/privacy-centre");
    expect(router.replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  it("says when the address names a request the caller cannot see", () => {
    centre({ missing: true });
    expect(screen.getByRole("dialog").textContent).toContain("This request is not available.");
  });
});

describe("A.5b Copy request", () => {
  it("lists the package and shows the 7-day link once", async () => {
    const act = vi.fn().mockResolvedValue({
      ok: true,
      requestId: COPY_REQUEST,
      link: {
        url: "http://127.0.0.1:54721/storage/v1/object/sign/exports/x.json?token=t",
        expires_at: "2026-10-19T05:00:00Z",
      },
      deleted: null,
    });
    centre({ detail: ZHANSAYA_DETAIL, act });
    const drawer = screen.getByRole("dialog", { name: "Copy request" });
    expect(drawer.textContent).toContain("What goes in the package");
    const items = [...drawer.querySelectorAll("li[data-item]")].map((row) => row.textContent);
    expect(items).toEqual([
      "Exam history4 exams with times and decisionsInclude",
      "Flags and frames1 flag, 1 frameInclude",
      "Consent records4 rule acceptancesInclude",
      "Devices1 laptop, Üki 1.4.2Include",
    ]);
    expect(drawer.textContent).toContain("One JSON file, linked for 7 days");
    expect(within(drawer).queryByRole("radio")).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "Create secure link" }));
    await waitFor(() => expect(act).toHaveBeenCalledWith({ requestId: COPY_REQUEST, action: "copy" }));
    const link = (await within(drawer).findByRole("textbox", { name: "Secure link" })) as HTMLInputElement;
    expect(link.value).toContain("/storage/v1/object/sign/exports/");
    expect(drawer.textContent).toContain("Package ready");
    expect(drawer.textContent).toContain(
      "Send this link to Zhansaya. It expires on 19 Oct, and is shown only now.",
    );
    expectClean();
  });

  it("offers a new link for a copy made before", () => {
    centre({
      detail: {
        ...ZHANSAYA_DETAIL,
        request: { ...ZHANSAYA_COPY, status: "done", done_at: "2026-10-10T06:00:00Z" },
        doneBy: "Dana Akhmetova",
      },
    });
    const drawer = screen.getByRole("dialog");
    expect(drawer.textContent).toContain("Dana Akhmetova made the copy on 10 Oct.");
    expect(within(drawer).getByRole("button", { name: "Create a new link" })).toBeTruthy();
  });
});

describe("A.6 Audit log", () => {
  function auditLog(props: Partial<Parameters<typeof AuditLogView>[0]> = {}) {
    return renderWithIntl(
      <AuditLogView
        entries={AUDIT_ENTRIES}
        truncated={false}
        filters={DEFAULT_AUDIT_FILTERS}
        me={DANA_ID}
        nowMs={NOW_MS}
        recordExport={vi.fn()}
        {...props}
      />,
      DANA,
    );
  }

  it("lists every entry newest first with who, what and on what", () => {
    auditLog();
    expect(screen.getByRole("heading", { level: 1, name: "Audit log" })).toBeTruthy();
    expect(document.body.textContent).toContain("Admin / Privacy / Audit log");
    const rows = [...document.querySelectorAll("tr[data-audit-id]")].map((row) => row.textContent);
    expect(rows).toEqual([
      "10 Oct · 03:00SystemDeleted 1,204 frames older than 90 daysWorkspace",
      "9 Oct · 15:10DADana AkhmetovaChanged retention from 120 to 90 daysWorkspace settings",
      "9 Oct · 12:05Share linkOpened through a share linkUKI-0917-MT3P",
      "9 Oct · 11:52ASAigerim SadykovaDecided: talk to the studentMadina T. · Mathematics 2",
      "9 Oct · 11:41ASAigerim SadykovaViewed 3 flagged framesMadina T. · Mathematics 2",
      "9 Oct · 10:00ASAigerim SadykovaStarted the examMathematics 2 · Midterm",
      "8 Oct · 12:40DADana AkhmetovaDeleted a student’s data on requestMadina T.",
    ]);
    expect(document.body.textContent).toContain("Entries can’t be edited or deleted.");
    expect(document.body.textContent).toContain("1–7 of 7");
    expectClean();
  });

  it("searches who, what and on what in the browser", () => {
    auditLog();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the audit log" }), {
      target: { value: "madina viewed" },
    });
    expect(document.querySelectorAll("tr[data-audit-id]")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the audit log" }), {
      target: { value: "nobody" },
    });
    expect(document.body.textContent).toContain("No entries match.");
  });

  it("reads another tab or range on the server", () => {
    auditLog();
    fireEvent.click(screen.getByRole("radio", { name: "Deletions" }));
    expect(router.replace).toHaveBeenCalledWith("/privacy-centre/audit-log?tab=deletions", { scroll: false });
  });

  it("records the export before the CSV leaves, and says when it cannot", async () => {
    const createObjectURL = vi.fn(() => "blob:audit");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const recordExport = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    auditLog({ recordExport });
    const button = screen.getByRole("button", { name: "Export CSV" });
    fireEvent.click(button);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(recordExport).toHaveBeenCalledTimes(1);
    // A click while the first export is still busy is ignored, so wait for the button to settle.
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
    fireEvent.click(button);
    await screen.findByText("Could not export. Try again.", undefined, { timeout: 5000 });
    expect(recordExport).toHaveBeenCalledTimes(2);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("says when the range holds more than it shows, and when it holds nothing", () => {
    auditLog({ truncated: true });
    expect(document.body.textContent).toContain("Showing the newest 500 entries.");
  });
});
