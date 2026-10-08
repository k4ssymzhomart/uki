// WP 1.12: A.5 Privacy centre with A.5a and A.5b open over it, and A.6 Audit log, render in Russian with no
// missing key, like every other dashboard page (WP 1.2's russian.test.tsx); 0.1b's "Open privacy centre"
// shows now that the page exists. Each test fails on any next-intl error and on any raw dashboard.* key
// left in the page.
import { act, fireEvent, screen } from "@testing-library/react";
import { loadMessages } from "@uki/i18n";
import { describe, expect, it, vi } from "vitest";
import { DataKeptTile } from "../src/features/overview/data-kept-popover.tsx";
import { AuditLogView } from "../src/features/privacy/audit-log-view.tsx";
import { PrivacyCentreView } from "../src/features/privacy/privacy-centre-view.tsx";
import { DEFAULT_AUDIT_FILTERS } from "../src/features/privacy/privacy-model.ts";
import {
  AUDIT_ENTRIES,
  CENTRE,
  DANA_ID,
  NOW_MS,
  YERLAN_DETAIL,
  ZHANSAYA_DETAIL,
} from "../src/features/privacy/test-fixtures.ts";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/image", () => import("./next-image-mock.tsx"));
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
vi.mock("../src/features/privacy/privacy-actions.ts", () => ({
  actOnRequest: vi.fn(),
  recordAuditExport: vi.fn(),
}));
vi.mock("../src/features/settings/settings-actions.ts", () => ({ saveWorkspaceSettings: vi.fn() }));
// 0.1b counts the stills and events under RLS when it opens.
vi.mock("../src/lib/supabase/browser.ts", () => ({
  createSupabaseBrowserClient: () => ({
    from: () => ({ select: () => ({ in: async () => ({ count: 0, error: null }) }) }),
  }),
}));

const ru = loadMessages("ru").dashboard;

function expectRussian(): void {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(document.body)).toEqual([]);
}

function centre(detail: typeof YERLAN_DETAIL | null) {
  return renderWithIntl(
    <PrivacyCentreView
      data={CENTRE}
      detail={detail}
      missing={false}
      me={DANA_ID}
      nowMs={NOW_MS}
      act={vi.fn()}
      save={vi.fn()}
    />,
    DANA,
    "ru",
  );
}

describe("WP 1.12 pages in Russian", () => {
  it("renders A.5 with the data map, recent access, retention and the requests", () => {
    centre(null);
    const text = document.body.textContent ?? "";
    expect(screen.getByRole("heading", { level: 1, name: ru.privacy.title })).toBeTruthy();
    expect(text).toContain("Администрирование / Конфиденциальность");
    expect(text).toMatch(/4\s912 сессий проверено на устройстве/);
    expect(text).toContain("Сервер Üki · Франкфурт");
    expect(text).toContain("До запроса на удаление");
    expect(text).toContain("90 дней");
    expect(text).toContain("Срок хранения изменён: 120 → 90 дн.");
    expect(text).toContain("Следующая очистка сегодня ночью, 03:00");
    expect(text).toContain("Yerlan Tokhtarov · срок 14 окт");
    expectRussian();
  });

  it("renders A.5a with what goes and what stays", () => {
    centre(YERLAN_DETAIL);
    const drawer = screen.getByRole("dialog", { name: ru.privacy.drawer.title.delete });
    const text = drawer.textContent ?? "";
    expect(text).toContain("Запрос от 7 окт");
    expect(text).toContain("Срок 14 окт");
    expect(text).toContain("4 кадра из 2 экзаменов");
    expect(text).toMatch(/1\s206 событий из 2 экзаменов/);
    expect(text).toContain("Удалить: 3 пункта");
    expect(text).toContain("Оставить");
    expectRussian();
  });

  it("renders A.5b with the package", () => {
    centre(ZHANSAYA_DETAIL);
    const drawer = screen.getByRole("dialog", { name: ru.privacy.drawer.title.copy });
    const text = drawer.textContent ?? "";
    expect(text).toContain("4 экзамена со временем и решениями");
    expect(text).toContain("1 ноутбук, Üki 1.4.2");
    expect(text).toContain(ru.privacy.copy.button);
    expectRussian();
  });

  it("renders A.6 with every entry", () => {
    renderWithIntl(
      <AuditLogView
        entries={AUDIT_ENTRIES}
        truncated
        filters={DEFAULT_AUDIT_FILTERS}
        me={DANA_ID}
        nowMs={NOW_MS}
        recordExport={vi.fn()}
      />,
      DANA,
      "ru",
    );
    const text = document.body.textContent ?? "";
    expect(screen.getByRole("heading", { level: 1, name: ru.privacy.audit.title })).toBeTruthy();
    expect(text).toContain("Администрирование / Конфиденциальность / Журнал аудита");
    expect(text).toContain("10 окт · 03:00");
    expect(text).toMatch(/Удалено кадров старше 90 дн\.: 1\s204/);
    expect(text).toContain("Просмотр 3 отмеченных кадров");
    expect(text).toContain("Решение: поговорить со студентом");
    expect(text).toContain("Ссылка для чтения");
    expect(text).toContain("Последние 7 дней");
    expectRussian();
  });
});

describe("0.1b in Russian", () => {
  it("leads to the privacy centre", async () => {
    renderWithIntl(<DataKeptTile examIds={[]} />, DANA, "ru");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ru.overview.stat.video.label }));
    });
    const link = await screen.findByRole("link", { name: ru.overview.dataKept.privacyCentre });
    expect(link.getAttribute("href")).toBe("/privacy-centre");
    expectRussian();
  });
});
