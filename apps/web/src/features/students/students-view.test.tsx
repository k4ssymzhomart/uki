import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { StudentProfileView } from "./student-profile-view.tsx";
import { NO_FILTERS, parseStudentRows } from "./students-model.ts";
import { StudentsView } from "./students-view.tsx";
import { FLAGGED, G102, MADINA_PROFILE, STUDENTS, studentId } from "./test-fixtures.ts";

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

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

function renderStudents(filters = NO_FILTERS, rows = STUDENTS) {
  window.history.replaceState(null, "", "/students");
  return renderWithIntl(
    <StudentsView
      rows={rows}
      flaggedThisTerm={FLAGGED}
      scopeName="Faculty of Mathematics"
      initialFilters={filters}
    />,
    DANA,
  );
}

const tableRows = () => screen.getByRole("table").querySelectorAll("tbody tr[data-student-id]");
const names = () => [...tableRows()].map((row) => row.querySelector("a")?.textContent);

function openMenu(name: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name }), { button: 0, ctrlKey: false });
}

describe("A.2 Students", () => {
  it("draws the frame's tiles, tabs, columns and rows with each status chip", () => {
    renderStudents();
    expect(screen.getByRole("heading", { level: 1, name: "Students" })).toBeTruthy();
    expect(document.body.textContent).toContain("Students / Faculty of Mathematics");
    expect(document.body.textContent).toContain("in 2 faculties");
    expect(document.body.textContent).toContain("71.4% of students");
    expect(screen.getByRole("radio", { name: "All · 7" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Flagged · 5" })).toBeTruthy();
    expect(names()).toEqual([
      "Arman Bekzhanov",
      "Aruzhan Kassymova",
      "Dias Kenzhebekov",
      "Madina Tulegenova",
      "Timur Nurlanov",
      "Zhansaya Omarova",
      "Aliya Seitkali",
    ]);
    const madina = screen.getByRole("link", { name: "Madina Tulegenova" }).closest("tr") as HTMLElement;
    expect(within(madina).getByText("20231187")).toBeTruthy();
    expect(within(madina).getByText("Group 204")).toBeTruthy();
    expect(within(madina).getByText("Mathematics, year 2")).toBeTruthy();
    expect(within(madina).getByText("follow-up")).toBeTruthy();
    expect(within(madina).getByText("9 Oct")).toBeTruthy();
    expect(within(madina).getByText("3").getAttribute("data-tone")).toBe("flag");
    expect(screen.getByRole("link", { name: "Madina Tulegenova" }).getAttribute("href")).toBe(
      `/students/${studentId("20231187")}`,
    );
    expect(document.body.textContent).toContain("in review");
    expect(document.body.textContent).toContain("no issue");
    expect(document.body.textContent).toContain("clear");
    expect(document.body.textContent).toContain("1–7 of 7");
    expect(screen.queryByRole("button", { name: /Import CSV/ })).toBeNull();
    expect(intlErrors).toEqual([]);
    expect(rawKeys(document.body)).toEqual([]);
  });

  it("finds Madina by name and by 20231187, and keeps the search in the address", () => {
    renderStudents();
    const search = screen.getByRole("searchbox", { name: "Search students by name or student ID" });
    fireEvent.change(search, { target: { value: "madina" } });
    expect(names()).toEqual(["Madina Tulegenova"]);
    expect(window.location.search).toBe("?q=madina");
    fireEvent.change(search, { target: { value: "20231187" } });
    expect(names()).toEqual(["Madina Tulegenova"]);
    expect(document.body.textContent).toContain("1–1 of 1");
    fireEvent.change(search, { target: { value: "nobody" } });
    expect(names()).toEqual([]);
    expect(document.body.textContent).toContain("No student matches the search and filters.");
  });

  it("filters by the Flagged tab, a group, a programme and a year", async () => {
    renderStudents();
    fireEvent.click(screen.getByRole("radio", { name: "Flagged · 5" }));
    expect(names()).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "All · 7" }));

    openMenu("Group");
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Group 102/ }));
    expect(names()).toEqual(["Aliya Seitkali"]);
    expect(window.location.search).toBe(`?group=${G102}`);
    openMenu("Group");
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "All groups" }));

    openMenu("Programme");
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Mathematics/ }));
    expect(names()).toHaveLength(5);
    openMenu("Year");
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Year 1/ }));
    expect(names()).toEqual([]);
    expect(window.location.search).toBe("?programme=Mathematics&year=1");
  });

  it("opens with the filters from the address", () => {
    renderStudents({ ...NO_FILTERS, query: "20231187" });
    expect(names()).toEqual(["Madina Tulegenova"]);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("20231187");
  });

  it("pages through 25 students at a time", () => {
    const many = parseStudentRows(
      Array.from({ length: 30 }, (_, i) => ({
        ...STUDENTS[0],
        id: `b0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        student_number: String(20240000 + i),
        full_name: `Student ${String(i + 1).padStart(2, "0")}`,
      })),
    );
    renderStudents(NO_FILTERS, many);
    expect(tableRows()).toHaveLength(25);
    expect(document.body.textContent).toContain("1–25 of 30");
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(tableRows()).toHaveLength(5);
    expect(document.body.textContent).toContain("26–30 of 30");
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says when the workspace has no students", () => {
    renderStudents(NO_FILTERS, []);
    expect(document.body.textContent).toContain("No students yet.");
    expect(document.body.textContent).toContain("0–0 of 0");
  });
});

describe("A.3 Student profile", () => {
  it("shows the exams with decisions, the devices, when and in which language the rules were accepted, and the data kept", () => {
    renderWithIntl(<StudentProfileView {...MADINA_PROFILE} />, DANA);
    expect(screen.getByRole("heading", { level: 1, name: "Madina Tulegenova" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Students / Group 204");
    expect(text).toContain("20231187 · Group 204 · Mathematics, year 2");
    expect(text).toContain("ҚАЗ");
    // Stat tiles.
    expect(text).toContain("since 24 September");
    expect(text).toContain("3 in Mathematics 2");
    expect(text).toContain("follow-up · 0 to committee");
    // Exam history, newest first.
    const history = [...document.querySelectorAll("li[data-session-id]")].map((li) => li.textContent);
    expect(history).toEqual([
      "9 OctMathematics 2 · Midterm87 of 90 min · 3 flagsfollow-up",
      "3 OctEnglish B2 · Reading48 of 50 min · 0 flagsclear",
      "24 SepLinear Algebra · Quiz 140 min · 1 flagin review",
    ]);
    // Devices from sessions.device.
    expect(text).toContain("macOS");
    expect(text).toContain("Üki 0.1.0 · seen 9 Oct");
    expect(text).toContain("Windows");
    expect(text).toContain("Üki Lock in Chrome");
    // Consent: the latest acceptance, in Kazakh, at 09:58 in Almaty.
    expect(text).toContain("Exam rules · Қазақша");
    expect(text).toContain("Accepted 9 Oct, 09:58");
    // Data kept: 9 Oct plus 90 days.
    expect(text).toContain("Flagged frames · 4");
    expect(text).toContain("Deleted on 7 Jan 2027");
    expect(text).toContain("Event log · 3 exams");
    expect(text).toContain("Video · 0 MB");
    // Phase 2 and 1.12 entry points stay hidden.
    expect(screen.queryByRole("link", { name: "Delete on request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
    expect(intlErrors).toEqual([]);
    expect(rawKeys(document.body)).toEqual([]);
  });

  it("says when a student has no exam, device or consent yet", () => {
    renderWithIntl(
      <StudentProfileView {...MADINA_PROFILE} sessions={[]} flags={[]} decisions={[]} frames={[]} />,
      DANA,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("No exams yet.");
    expect(text).toContain("No device yet");
    expect(text).toContain("Not accepted yet");
    expect(text).toContain("None kept");
    expect(intlErrors).toEqual([]);
  });
});
