// WP 1.11: A.2 Students, A.3 Student profile and A.4 Settings render in Russian with no missing key, like
// every other dashboard page (WP 1.2's russian.test.tsx). Each test fails on any next-intl error and on
// any raw dashboard.* key left in the page.
import { fireEvent, screen } from "@testing-library/react";
import { loadMessages } from "@uki/i18n";
import { describe, expect, it, vi } from "vitest";
import { SettingsView } from "../src/features/settings/settings-view.tsx";
import { StudentProfileView } from "../src/features/students/student-profile-view.tsx";
import { NO_FILTERS } from "../src/features/students/students-model.ts";
import { StudentsView } from "../src/features/students/students-view.tsx";
import {
  FLAGGED,
  MADINA_PROFILE,
  SETTINGS,
  STUDENTS,
  WORKSPACE,
} from "../src/features/students/test-fixtures.ts";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    prefetch?: boolean;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../src/features/settings/settings-actions.ts", () => ({ saveWorkspaceSettings: vi.fn() }));

const ru = loadMessages("ru").dashboard;

function expectRussian(): void {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(document.body)).toEqual([]);
}

describe("WP 1.11 pages in Russian", () => {
  it("renders A.2 with its tiles, tabs, filters, rows and footer", async () => {
    renderWithIntl(
      <StudentsView
        rows={STUDENTS}
        flaggedThisTerm={FLAGGED}
        scopeName="Математический факультет"
        initialFilters={NO_FILTERS}
      />,
      DANA,
      "ru",
    );
    const text = document.body.textContent ?? "";
    expect(screen.getByRole("heading", { level: 1, name: ru.students.title })).toBeTruthy();
    expect(text).toContain("Студенты / Математический факультет");
    expect(text).toContain("на 2 факультетах");
    // Russian puts a no-break space before the percent sign.
    expect(text).toMatch(/71,4\s%\sстудентов/);
    expect(screen.getByRole("radio", { name: "Все · 7" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "С отметками · 5" })).toBeTruthy();
    expect(text).toContain("Группа 204");
    expect(text).toContain("Mathematics, 2 курс");
    expect(text).toContain("беседа");
    expect(text).toContain("на проверке");
    expect(text).toContain("9 окт");
    expect(text).toContain("1–7 из 7");
    fireEvent.pointerDown(screen.getByRole("button", { name: ru.students.filter.year.label }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByRole("menuitemcheckbox", { name: /1 курс/ })).toBeTruthy();
    expect(screen.getByRole("menuitemcheckbox", { name: ru.students.filter.year.all })).toBeTruthy();
    expectRussian();
  });

  it("renders A.3 with the history, devices, consent and data kept", () => {
    renderWithIntl(<StudentProfileView {...MADINA_PROFILE} />, DANA, "ru");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Студенты / Группа 204");
    expect(text).toContain("с 24 сентября");
    expect(text).toContain("3 по курсу «Mathematics 2»");
    expect(text).toContain("беседа · в комиссию: 0");
    expect(text).toContain("87 из 90 мин · 3 отметки");
    expect(text).toContain("Üki 0.1.0 · в сети 9 окт");
    expect(text).toContain("Правила экзамена · Қазақша");
    expect(text).toContain("Приняты 9 окт, 09:58");
    expect(text).toContain("Удаляются 7 янв 2027");
    expect(text).toContain("Журнал событий · 3 экзамена");
    expectRussian();
  });

  it("renders A.4 with the defaults and the checks", () => {
    renderWithIntl(<SettingsView workspaceId={WORKSPACE} settings={SETTINGS} save={vi.fn()} />, DANA, "ru");
    const text = document.body.textContent ?? "";
    expect(screen.getByRole("heading", { level: 1, name: ru.settings.title })).toBeTruthy();
    expect(text).toContain("Администрирование / Настройки");
    expect(text).toContain("2 секунды");
    expect(text).toContain("0,85");
    expect(text).toContain("90 дней");
    expect(text).toContain("за 20 мин до начала");
    expect(screen.getByRole("switch", { name: ru.settings.checks.identity.title })).toBeTruthy();
    expectRussian();
  });
});
