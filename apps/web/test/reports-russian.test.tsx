// WP 1.10: A.1 Reports renders in Russian with no missing key, like every other dashboard page (WP 1.2's
// russian.test.tsx). Each test fails on any next-intl error and on any raw dashboard.* key in the page.
import { fireEvent, screen } from "@testing-library/react";
import { loadMessages } from "@uki/i18n";
import { describe, expect, it, vi } from "vitest";
import { ReportsView } from "../src/features/reports/reports-view.tsx";
import { EMPTY_DATA, FACULTIES, FRAME_DATA, MATH } from "../src/features/reports/test-fixtures.ts";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/features/shell/preferences.ts", () => ({ setOverviewFaculty: vi.fn() }));

const ru = loadMessages("ru").dashboard;

function expectRussian(): void {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(document.body)).toEqual([]);
}

/** Russian groups thousands and spaces the percent sign with no-break spaces; tests read plain spaces. */
const plain = (text: string | null | undefined) => (text ?? "").replace(/[  ]/g, " ");

describe("WP 1.10 A.1 in Russian", () => {
  it("renders the term's tiles, cards and pickers", async () => {
    renderWithIntl(
      <ReportsView data={FRAME_DATA} faculties={FACULTIES} facultyId={MATH} workspaceName="KRU · Kostanay" />,
      DANA,
      "ru",
    );
    const text = plain(document.body.textContent);
    expect(screen.getByRole("heading", { level: 1, name: ru.reports.title })).toBeTruthy();
    expect(text).toContain("Отчёты / Осенний семестр 2026");
    expect(text).toContain("Экспорт в PDF");
    expect(text).toContain("Проведено экзаменов38с 1 сент");
    expect(text).toContain("Сеансы4 912студенты × экзамены");
    expect(text).toContain("Отметок на 1008,4меньше, чем 10,5 в сентябре");
    expect(text).toContain("В комиссию0,5 %23 из 4 912 сеансов");
    expect(text).toContain("Снижение с 11,6 до 8,4 за шесть недель");
    expect(text).toContain("Взгляд в сторону — почти половина");
    expect(text).toContain("Решения · 298 сеансов с отметками");
    expect(text).toContain("Чаще всего нарушения нет");
    expect(text).toContain("Беседа со студентом61 · 20 %");
    expect(text).toContain("Проверка ускорилась: 2:30 → 1:40");
    fireEvent.pointerDown(screen.getByRole("button", { name: ru.reports.filter.term }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByRole("menuitemcheckbox", { name: "Весенний семестр 2026" })).toBeTruthy();
    expectRussian();
  });

  it("renders a term without exams", () => {
    renderWithIntl(
      <ReportsView data={EMPTY_DATA} faculties={FACULTIES} facultyId={null} workspaceName="KRU · Kostanay" />,
      DANA,
      "ru",
    );
    const text = plain(document.body.textContent);
    expect(text).toContain("Весенний семестр 2027");
    expect(text).toContain("Все факультеты");
    expect(text).toContain("В этом семестре экзаменов ещё не было");
    expect(text).toContain("В этом семестре отметок ещё нет");
    expect(text).toContain("В этом семестре решений ещё нет");
    expect(text).toContain("В этом семестре проверок ещё не было");
    expectRussian();
  });
});
