import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Avatar } from "./avatar.tsx";
import { Badge } from "./badge.tsx";
import { CheckRow } from "./check-row.tsx";
import { Chip } from "./chip.tsx";
import { rowExamColumns } from "./columns.ts";
import { Count } from "./count.tsx";
import { EventRow } from "./event-row.tsx";
import { EvidenceCard } from "./evidence-card.tsx";
import { initials } from "./initials.ts";
import { RowAction } from "./row-action.tsx";
import { RowExam } from "./row-exam.tsx";
import { RowLobby } from "./row-lobby.tsx";
import { RowSession } from "./row-session.tsx";
import { ariaSort, nextSort } from "./sort.ts";
import { StatTile } from "./stat-tile.tsx";
import { Table } from "./table.tsx";
import { TableEmptyState } from "./table-empty-state.tsx";
import { TableHeaderCell } from "./table-header-cell.tsx";
import { TableSkeletonRow } from "./table-skeleton-row.tsx";

function InHead({ children }: { children: ReactNode }) {
  return (
    <Table>
      <thead>
        <tr>{children}</tr>
      </thead>
    </Table>
  );
}

function InBody({ children }: { children: ReactNode }) {
  return (
    <Table aria-label="Rows">
      <tbody>{children}</tbody>
    </Table>
  );
}

describe("initials", () => {
  it("takes the first letters of the first and last word", () => {
    expect(initials("Dias Kenzhebekov")).toBe("DK");
    expect(initials("  Aigerim   Sadykova  ")).toBe("AS");
    expect(initials("Madina Serikovna Tulegenova")).toBe("MT");
  });

  it("handles one word, an empty name and Kazakh letters", () => {
    expect(initials("Kassymzhomart")).toBe("K");
    expect(initials("   ")).toBe("");
    expect(initials("әсел нұрланқызы", "kk")).toBe("ӘН");
  });
});

describe("sort", () => {
  it("cycles None, Asc, Desc, None", () => {
    expect(nextSort("none")).toBe("asc");
    expect(nextSort("asc")).toBe("desc");
    expect(nextSort("desc")).toBe("none");
  });

  it("maps to aria-sort", () => {
    expect(ariaSort("none")).toBe("none");
    expect(ariaSort("asc")).toBe("ascending");
    expect(ariaSort("desc")).toBe("descending");
  });
});

describe("Chip, Badge, Count, Avatar", () => {
  it("renders the label with a decorative dot", () => {
    render(<Chip status="flag">phone 0.94</Chip>);
    const chip = screen.getByText("phone 0.94");
    expect(chip).toHaveProperty("dataset.status", "flag");
    expect(chip.querySelector("[aria-hidden='true']")?.className).toContain("bg-flag");
  });

  it("puts each tone on its own token classes", () => {
    render(
      <>
        <Badge tone="ink">Ready</Badge>
        <Count tone="flag">3</Count>
        <Avatar tone="paper" size="md" initials="DK" />
      </>,
    );
    expect(screen.getByText("Ready").className).toContain("bg-inverse");
    expect(screen.getByText("3").className).toContain("bg-flag");
    const avatar = screen.getByText("DK");
    expect(avatar.className).toContain("bg-subtle");
    expect(avatar.className).toContain("size-9");
  });

  it("spreads native props and passes ref", () => {
    let node: HTMLSpanElement | null = null;
    render(
      <Count
        ref={(element) => {
          node = element;
        }}
        aria-label="3 flags"
      >
        3
      </Count>,
    );
    expect(screen.getByLabelText("3 flags")).toBe(node);
  });
});

describe("StatTile", () => {
  it("shows label, value and an optional caption", () => {
    const { rerender } = render(<StatTile label="Live now" value="128" caption="3 groups · 2 proctors" />);
    expect(screen.getByText("128")).toBeDefined();
    expect(screen.getByText("3 groups · 2 proctors")).toBeDefined();
    rerender(<StatTile label="Live now" value="128" />);
    expect(screen.queryByText("3 groups · 2 proctors")).toBeNull();
  });
});

describe("CheckRow", () => {
  it("maps each status to its chip and marks running as busy", () => {
    const { rerender, container } = render(
      <CheckRow status="pass" title="Camera" detail="One face" statusLabel="Ready" />,
    );
    expect(screen.getByText("Ready")).toHaveProperty("dataset.status", "ok");
    expect(container.firstElementChild?.getAttribute("aria-busy")).toBeNull();
    rerender(<CheckRow status="fail" title="Camera" statusLabel="Fix this" />);
    expect(screen.getByText("Fix this")).toHaveProperty("dataset.status", "flag");
    rerender(<CheckRow status="running" title="Camera" statusLabel="Checking" />);
    expect(screen.getByText("Checking")).toHaveProperty("dataset.status", "idle");
    expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("EventRow and EvidenceCard", () => {
  it("renders a time element and a named dot when kindLabel is set", () => {
    render(
      <EventRow
        kind="flag"
        kindLabel="Flag"
        time="10:47:10"
        dateTime="2026-10-09T05:47:10Z"
        title="Phone in frame"
        detail="Confidence 0.94"
      />,
    );
    expect(screen.getByText("10:47:10").getAttribute("datetime")).toBe("2026-10-09T05:47:10Z");
    expect(screen.getByRole("img", { name: "Flag" }).className).toContain("bg-flag");
  });

  it("keeps the dot decorative without kindLabel", () => {
    render(<EventRow time="10:47:10" title="Phone in frame" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("puts the still in the frame slot", () => {
    render(
      <EvidenceCard
        image={<img src="still.webp" alt="Still 1 of 3" />}
        chipLabel="phone 0.94"
        time="10:47:10"
        title="Phone in frame"
      />,
    );
    expect(screen.getByRole("img", { name: "Still 1 of 3" })).toBeDefined();
    expect(screen.getByText("phone 0.94")).toHaveProperty("dataset.status", "flag");
  });
});

describe("TableHeaderCell", () => {
  it("is a plain column header without onSortChange", () => {
    render(
      <InHead>
        <TableHeaderCell label="Device" />
      </InHead>,
    );
    const header = screen.getByRole("columnheader", { name: "Device" });
    expect(header.getAttribute("aria-sort")).toBeNull();
    expect(within(header).queryByRole("button")).toBeNull();
  });

  it("asks for the next sort state on click", () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <InHead>
        <TableHeaderCell label="Student" sort="none" onSortChange={onSortChange} />
      </InHead>,
    );
    const header = screen.getByRole("columnheader", { name: "Student" });
    expect(header.getAttribute("aria-sort")).toBe("none");
    fireEvent.click(within(header).getByRole("button", { name: "Student" }));
    expect(onSortChange).toHaveBeenLastCalledWith("asc");
    rerender(
      <InHead>
        <TableHeaderCell label="Student" sort="desc" onSortChange={onSortChange} />
      </InHead>,
    );
    expect(header.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(within(header).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("none");
  });

  it("is reachable by keyboard", () => {
    render(
      <InHead>
        <TableHeaderCell label="Student" onSortChange={() => {}} />
      </InHead>,
    );
    const button = screen.getByRole("button", { name: "Student" });
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
  });

  it("takes the row's column class", () => {
    render(
      <InHead>
        <TableHeaderCell className={rowExamColumns.exam} label="Exam" />
      </InHead>,
    );
    expect(screen.getByRole("columnheader").className).toContain("w-90");
  });
});

describe("table rows", () => {
  it("renders Row/Lobby as a row of cells with a working action", () => {
    const onAction = vi.fn();
    render(
      <InBody>
        <RowLobby
          initials="DK"
          name="Dias Kenzhebekov"
          studentId="20231044"
          step="Identity check"
          stepDetail="Card unreadable · retry 2 of 3"
          device="Windows 11 · Wi-Fi"
          status="warn"
          statusLabel="Needs help"
          action={
            <RowAction icon="message" onClick={onAction}>
              Message
            </RowAction>
          }
        />
      </InBody>,
    );
    const row = screen.getByRole("row");
    expect(within(row).getAllByRole("cell")).toHaveLength(5);
    fireEvent.click(within(row).getByRole("button", { name: "Message" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("makes Row/Exam a stretched link and filters its checks", () => {
    render(
      <InBody>
        <RowExam
          exam="Mathematics 2 · Midterm"
          when="Fri 9 Oct · 10:00"
          students="128"
          checks={{ id: false }}
          checkLabels={{ lock: "Üki Lock", gaze: "Gaze" }}
          status="idle"
          statusLabel="Scheduled"
          href="/exams/1/lobby"
        />
      </InBody>,
    );
    const link = screen.getByRole("link", { name: "Mathematics 2 · Midterm" });
    expect(link.getAttribute("href")).toBe("/exams/1/lobby");
    expect(link.className).toContain("after:inset-0");
    expect(screen.getByRole("img", { name: "Üki Lock" })).toBeDefined();
    expect(screen.getByRole("img", { name: "Gaze" })).toBeDefined();
    const row = screen.getByRole("row");
    expect(row.querySelectorAll("[data-check]")).toHaveLength(3);
    expect(row.querySelector("[data-check='id']")).toBeNull();
    expect(row.querySelector("[data-check='phone'] svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(row).getAllByRole("cell")).toHaveLength(6);
  });

  it("uses a custom link component for Row/Exam", () => {
    function FakeLink({
      href,
      className,
      children,
    }: {
      href: string;
      className?: string;
      children?: ReactNode;
    }) {
      return (
        <a data-fake="" href={href} className={className}>
          {children}
        </a>
      );
    }
    render(
      <InBody>
        <RowExam
          exam="Physics"
          when="Fri"
          students="42"
          status="ok"
          statusLabel="Live"
          href="/x"
          linkAs={FakeLink}
        />
      </InBody>,
    );
    expect(screen.getByRole("link", { name: "Physics" }).hasAttribute("data-fake")).toBe(true);
  });

  it("renders Row/Session with a link action through asChild", () => {
    render(
      <InBody>
        <RowSession
          initials="MT"
          name="Madina Tulegenova"
          studentId="20231187"
          flagCount="3"
          topFlag="Phone in frame · 0.94"
          duration="88 min"
          status="warn"
          statusLabel="Needs review"
          action={
            <RowAction icon="arrow-right" iconPosition="end" asChild>
              <a href="/review/1">Review</a>
            </RowAction>
          }
        />
      </InBody>,
    );
    const link = screen.getByRole("link", { name: "Review" });
    expect(link.getAttribute("href")).toBe("/review/1");
    expect(link.lastElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(screen.getByText("3").className).toContain("bg-flag");
  });

  it("disables a row action", () => {
    const onClick = vi.fn();
    render(
      <RowAction icon="message" disabled onClick={onClick}>
        Call
      </RowAction>,
    );
    const button = screen.getByRole("button", { name: "Call" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("table states", () => {
  it("hides skeleton rows from assistive technology", () => {
    const { container } = render(
      <InBody>
        <TableSkeletonRow colSpan={5} />
      </InBody>,
    );
    const row = container.querySelector("tr");
    expect(row?.querySelector("td")?.colSpan).toBe(5);
    expect(row?.querySelector("td > div")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the empty state with its action", () => {
    render(
      <TableEmptyState
        title="Nothing to review"
        body="New flags show up here."
        action={<button type="button">Open the live wall</button>}
      />,
    );
    expect(screen.getByText("Nothing to review")).toBeDefined();
    expect(screen.getByRole("button", { name: "Open the live wall" })).toBeDefined();
  });
});
