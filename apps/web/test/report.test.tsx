// WP 1.9: 3.4 (the integrity report with Download PDF, Export CSV, Share link and Revoke), 3.5 (the shared
// report), /verify/[code] with its try-again state and the share link's not-found page, in English for
// behaviour and in Russian with no next-intl error and no raw key (the Russian render check every new
// dashboard page gets).
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { StillsRequest } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventsCsv } from "../src/features/report/report-model.ts";
import { ReportView } from "../src/features/report/report-view.tsx";
import { SharedReportView } from "../src/features/report/shared-report-view.tsx";
import { reportFixture, sharedFixture } from "../src/features/report/test-fixtures.ts";
import { ShareNotFoundView, VerifyView } from "../src/features/report/verify-view.tsx";
import type { FunctionsClient } from "../src/features/wall/functions-client.ts";
import { FunctionsClientContext } from "../src/features/wall/use-command.ts";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

vi.mock("next/navigation", () => ({
  usePathname: () => "/review/d0000000-0000-4000-8001-000000000007/report",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/image", () => import("./next-image-mock.tsx"));
const actions = vi.hoisted(() => ({ createShareLink: vi.fn(), revokeShareLinks: vi.fn() }));
vi.mock("../src/features/report/report-actions.ts", () => actions);

/** A share token's shape: 43 base64url characters. */
const TOKEN = "T".repeat(43);

function functions() {
  const stills = vi.fn(async (request: StillsRequest) => ({
    ok: true as const,
    data: {
      urls: [
        {
          frame_id: "f1000000-0000-4000-8000-000000000001",
          url: `http://127.0.0.1:55021/storage/v1/object/sign/frames/${request.event_id}-0.jpg?token=t`,
          captured_at: "2026-10-09T05:47:10.000Z",
        },
      ],
    },
  }));
  const api: FunctionsClient = {
    command: vi.fn(async () => ({ ok: true as const, data: { command_ids: [] } })),
    stills,
  };
  return { api, stills };
}

/** A link of the report that still opens, as loadReport reads it. */
const ACTIVE = {
  id: "01900000-0000-7000-8000-0000000000b1",
  created_at: "2026-10-09T06:52:00.000Z",
  expires_at: "2026-11-08T06:52:00.000Z",
};

function renderReport(locale: "en" | "ru" = "en", shares: (typeof ACTIVE)[] = []) {
  const fn = functions();
  const report = reportFixture();
  const events = [
    {
      id: "01900000-0000-7000-8000-00000000a001",
      session_id: report.session.id,
      exam_id: report.exam.id,
      type: "phone.detected" as const,
      source: "app" as const,
      review: "flag" as const,
      at: "2026-10-09T05:47:10.000Z",
      received_at: "2026-10-09T05:47:10.300Z",
      data: { score: 0.94, held_ms: 6000 },
      frame_count: 1,
    },
  ];
  const view = renderWithIntl(
    <FunctionsClientContext value={() => fn.api}>
      <ReportView report={report} events={events} shares={shares} />
    </FunctionsClientContext>,
    DANA,
    locale,
  );
  return { ...fn, events, view };
}

beforeEach(() => {
  actions.createShareLink.mockReset();
  actions.revokeShareLinks.mockReset();
});

afterEach(() => {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  vi.restoreAllMocks();
});

describe("3.4 Integrity report", () => {
  it("shows the report page as Figma draws it, with each flag's first still from the stills function", async () => {
    const { stills } = renderReport();
    expect(screen.getByText("Review / Mathematics 2 · Midterm / Madina Tulegenova")).toBeTruthy();
    const page = screen.getByRole("article");
    expect(within(page).getByText("UKI-7K2M-9QXD")).toBeTruthy();
    expect(within(page).getByRole("heading", { level: 2, name: "Integrity report" })).toBeTruthy();
    expect(within(page).getByText("Mathematics 2 · Midterm · Fri 9 Oct 2026 · Group 204")).toBeTruthy();
    expect(within(page).getByText("Madina Tulegenova · 20231187")).toBeTruthy();
    expect(within(page).getByText("Matched on device · 09:40:55")).toBeTruthy();
    expect(within(page).getByText("87 of 90 min")).toBeTruthy();
    expect(within(page).getByText("Aigerim Sadykova")).toBeTruthy();
    expect(within(page).getByText("Flags · 3")).toBeTruthy();
    const flags = [...page.querySelectorAll("li[data-flag-type]")].map((li) => li.textContent);
    expect(flags).toEqual([
      "10:43:02  Looked away2.3 s, to the left",
      "10:47:10  Phone in frameConfidence 0.94 · held 6 s",
      "10:58:40  Looked down3.1 s",
    ]);
    expect(within(page).getByText("Talk to the student")).toBeTruthy();
    expect(within(page).getByText("Phone face down after the warning.")).toBeTruthy();
    expect(within(page).getByText("Aigerim S. · 11:52")).toBeTruthy();
    expect(within(page).getByText(/^Flag ≠ fail\./)).toBeTruthy();

    await waitFor(() => expect(page.querySelectorAll("img[alt^='Still of the flag']")).toHaveLength(3));
    expect(stills).toHaveBeenCalledTimes(3);
    const phone = within(page).getByAltText("Still of the flag at 10:47:10");
    expect(phone.getAttribute("src")).toContain("01900000-0000-7000-8000-00000000a001-0.jpg");
    expect(phone.getAttribute("referrerpolicy")).toBe("no-referrer");

    const kept = screen.getByRole("region", { name: "Data kept" });
    expect(within(kept).getByText("0 MB")).toBeTruthy();
    expect(within(kept).getByText("61")).toBeTruthy();
    expect(within(kept).getByText("12,418")).toBeTruthy();
    expect(within(kept).getByText("90 days, then deleted")).toBeTruthy();
  });

  it("Download PDF prints the page and Export CSV saves the session's events built in the browser", async () => {
    const { events } = renderReport();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalledTimes(1);

    let saved: Blob | null = null;
    const create = vi.fn((blob: Blob) => {
      saved = blob;
      return "blob:report";
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(clicks).toEqual(["uki-report-UKI-7K2M-9QXD-events.csv"]);
    expect(saved).not.toBeNull();
    expect(await (saved as unknown as Blob).text()).toBe(eventsCsv(events));
  });

  it("Share with the committee makes the link once, shows it and copies it", async () => {
    actions.createShareLink.mockResolvedValue({
      ok: true,
      path: `/r/${TOKEN}`,
      expiresAt: "2026-10-16T06:52:00.000Z",
    });
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderReport();
    const field = screen.getByRole("button", { name: "Share with the committee" });
    expect(field.textContent).toBe("Read-only link · expires in 30 days");
    expect(screen.queryByTestId("share-revoke")).toBeNull();
    await act(async () => {
      fireEvent.click(field);
    });
    expect(actions.createShareLink).toHaveBeenCalledWith({
      report_id: "f0000000-0000-4000-8000-000000000917",
    });
    const link = screen.getByTestId("share-link") as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/r/${TOKEN}`);
    expect(writeText).toHaveBeenCalledWith(link.value);
    expect(
      screen.getByText("Shown only once. Copy it now; Üki keeps only a fingerprint of it."),
    ).toBeTruthy();
    expect(await screen.findByText("Link copied")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(actions.createShareLink).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Revoke every link to this report" }).textContent).toBe(
      "Revoke",
    );
  });

  it("Revoke beside Share link withdraws the report's links and says how many", async () => {
    actions.revokeShareLinks.mockResolvedValue({ ok: true, revoked: 2 });
    renderReport("en", [ACTIVE, { ...ACTIVE, id: "01900000-0000-7000-8000-0000000000b2" }]);
    expect(screen.getByText("2 active links")).toBeTruthy();
    const revoke = screen.getByRole("button", { name: "Revoke every link to this report" });
    expect(revoke.closest("label")).toBeNull();
    await act(async () => {
      fireEvent.click(revoke);
    });
    expect(actions.revokeShareLinks).toHaveBeenCalledWith({
      report_id: "f0000000-0000-4000-8000-000000000917",
    });
    expect(await screen.findByText("2 links revoked")).toBeTruthy();
    expect(screen.queryByTestId("share-revoke")).toBeNull();
    expect(screen.queryByText("2 active links")).toBeNull();
    expect(screen.getByRole("button", { name: "Share with the committee" }).textContent).toBe(
      "Read-only link · expires in 30 days",
    );
  });

  it("Revoke clears a link just made, and says when it failed", async () => {
    actions.createShareLink.mockResolvedValue({
      ok: true,
      path: `/r/${TOKEN}`,
      expiresAt: "2026-11-08T06:52:00.000Z",
    });
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
    actions.revokeShareLinks.mockResolvedValueOnce({ ok: false, code: "forbidden" });
    renderReport();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share with the committee" }));
    });
    expect(screen.getByTestId("share-link")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-revoke"));
    });
    expect(screen.getByText("The links could not be revoked. Try again.")).toBeTruthy();
    expect(screen.getByTestId("share-link")).toBeTruthy();
    actions.revokeShareLinks.mockResolvedValueOnce({ ok: true, revoked: 1 });
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-revoke"));
    });
    expect(screen.queryByTestId("share-link")).toBeNull();
    expect(await screen.findByText("1 link revoked")).toBeTruthy();
  });

  it("says when the link could not be made", async () => {
    actions.createShareLink.mockResolvedValue({ ok: false, code: "forbidden" });
    renderReport();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share with the committee" }));
    });
    expect(screen.getByText("The link could not be made. Try again.")).toBeTruthy();
    expect(screen.queryByTestId("share-link")).toBeNull();
  });
});

describe("3.5 Shared report", () => {
  it("shows the banner, the report with its stills and This copy as Figma draws them", () => {
    renderWithIntl(<SharedReportView report={sharedFixture()} />);
    expect(
      screen.getByText(
        "Read-only. Shared by Dana Akhmetova, KRU · Kostanay. Link expires 16 Oct 2026, 11:52.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Integrity report" })).toBeTruthy();
    const page = screen.getByRole("article");
    expect(within(page).getByAltText("Still of the flag at 10:47:10").getAttribute("src")).toBe(
      "https://stills.test/0.jpg",
    );
    const copy = screen.getByRole("region", { name: "This copy" });
    expect(within(copy).getByText("9 Oct 2026 · 11:52 by Üki")).toBeTruthy();
    expect(within(copy).getByText("UKI-7K2M-9QXD")).toBeTruthy();
    expect(within(copy).getByText("0 MB")).toBeTruthy();
    expect(within(copy).getByText("3 of 61 in this exam")).toBeTruthy();
    expect(within(copy).getByText("412 for this session")).toBeTruthy();
    expect(within(copy).getByText("7 Jan 2027, then deleted")).toBeTruthy();
    expect(
      within(copy).getByText(
        "“Talk to the student” means the proctor wants a conversation, not a sanction. The committee decides any next step.",
      ),
    ).toBeTruthy();
    expect(
      within(copy).getByText("Opening this link is recorded in the KRU · Kostanay audit log."),
    ).toBeTruthy();
  });
});

describe("/verify/[code]", () => {
  it("confirms an unchanged report with its exam, date, initials and issue time", () => {
    renderWithIntl(
      <VerifyView
        code="uki-7k2m-9qxd"
        result={{
          found: true,
          code: "7K2M9QXD",
          exam_title: "Mathematics 2 · Midterm",
          exam_starts_at: "2026-10-09T05:00:00.000Z",
          timezone: "Asia/Almaty",
          initials: "MT",
          issued_at: "2026-10-09T06:52:00.000Z",
          intact: true,
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "This code belongs to an Üki integrity report that has not changed since it was issued.",
    );
    expect(screen.getByText("UKI-7K2M-9QXD")).toBeTruthy();
    expect(screen.getByText("Mathematics 2 · Midterm")).toBeTruthy();
    expect(screen.getByText("Fri 9 Oct 2026")).toBeTruthy();
    expect(screen.getByText("MT")).toBeTruthy();
    expect(screen.getByText("9 Oct 2026 · 11:52 by Üki")).toBeTruthy();
  });

  it("refuses a changed report and an unknown code with the same line and no details", () => {
    renderWithIntl(
      <VerifyView
        code="7K2M9QXD"
        result={{
          found: true,
          code: "7K2M9QXD",
          exam_title: "Mathematics 2 · Midterm",
          exam_starts_at: "2026-10-09T05:00:00.000Z",
          timezone: "Asia/Almaty",
          initials: "MT",
          issued_at: "2026-10-09T06:52:00.000Z",
          intact: false,
        }}
      />,
    );
    const line =
      "This code does not match a current Üki integrity report. The printout may be of an older version.";
    expect(screen.getByRole("status").textContent).toBe(line);
    expect(screen.queryByText("Mathematics 2 · Midterm")).toBeNull();
    document.body.innerHTML = "";
    renderWithIntl(<VerifyView code="not-a-real-code" result={{ found: false }} />);
    expect(screen.getByRole("status").textContent).toBe(line);
    expect(screen.getByText("not-a-real-code")).toBeTruthy();
  });

  it("after 10 lookups in a minute asks to wait, with Try again on the same code", () => {
    renderWithIntl(<VerifyView code="uki-7k2m-9qxd" result="rate_limited" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Too many checks from this connection. Wait a minute, then try again.");
    expect(status.getAttribute("data-result")).toBe("rate-limited");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(
      "/verify/uki-7k2m-9qxd",
    );
    expect(screen.getByText("UKI-7K2M-9QXD")).toBeTruthy();
  });

  it("the share link's not-found page says the link is not available", () => {
    renderWithIntl(<ShareNotFoundView />);
    expect(screen.getByRole("heading", { level: 1, name: "This link is not available" })).toBeTruthy();
  });
});

describe("3.4, 3.5, /verify and the not-found page in Russian", () => {
  it("3.4 renders in Russian with no missing key", async () => {
    const { view } = renderReport("ru", [ACTIVE]);
    expect(screen.getByText("Ссылка для чтения · 30 дней")).toBeTruthy();
    expect(screen.getByText("Отозвать")).toBeTruthy();
    expect(screen.getByText("1 действующая ссылка")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Отчёт о проверке" })).toBeTruthy();
    expect(screen.getByText("пт, 9 окт 2026", { exact: false })).toBeTruthy();
    expect(screen.getByText("87 из 90 мин")).toBeTruthy();
    expect(screen.getByText("Поговорить со студентом")).toBeTruthy();
    expect(screen.getByText("90 дней, затем удаляются")).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll("article img[referrerpolicy]")).toHaveLength(3));
    expect(rawKeys(view.container)).toEqual([]);
  });

  it("3.5 renders in Russian with no missing key", () => {
    const { container } = renderWithIntl(<SharedReportView report={sharedFixture()} />, null, "ru");
    expect(screen.getByText("Эта копия")).toBeTruthy();
    expect(screen.getByText("3 из 61 на этом экзамене")).toBeTruthy();
    expect(rawKeys(container)).toEqual([]);
  });

  it("/verify and the not-found page render in Russian with no missing key", () => {
    const verify = renderWithIntl(<VerifyView code="x" result={{ found: false }} />, null, "ru");
    expect(screen.getByRole("status").textContent).toContain("Этот код не совпадает");
    expect(rawKeys(verify.container)).toEqual([]);
    verify.unmount();
    const limited = renderWithIntl(<VerifyView code="x" result="rate_limited" />, null, "ru");
    expect(screen.getByRole("status").textContent).toContain("Слишком много проверок");
    expect(screen.getByRole("link", { name: "Проверить снова" })).toBeTruthy();
    expect(rawKeys(limited.container)).toEqual([]);
    limited.unmount();
    const missing = renderWithIntl(<ShareNotFoundView />, null, "ru");
    expect(screen.getByText("Ссылка недоступна")).toBeTruthy();
    expect(rawKeys(missing.container)).toEqual([]);
  });
});
