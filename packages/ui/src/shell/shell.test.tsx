import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar, type SidebarSection } from "./app-sidebar.tsx";
import { AppTitleBar } from "./app-title-bar.tsx";
import { AppTopBar } from "./app-top-bar.tsx";
import { BrowserTopBar } from "./browser-top-bar.tsx";
import { NavItem } from "./nav-item.tsx";
import { SearchField } from "./search-field.tsx";
import { SidebarNote } from "./sidebar-note.tsx";
import { SidebarUser } from "./sidebar-user.tsx";
import { SidebarWorkspace } from "./sidebar-workspace.tsx";
import { Step } from "./step.tsx";
import { Tab } from "./tab.tsx";
import { TabGroup } from "./tab-group.tsx";
import { WindowButtons } from "./window-buttons.tsx";

const SECTIONS: readonly SidebarSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "overview", icon: "layout-grid", label: "Overview", href: "/overview", active: true },
      { id: "exams", icon: "exam", label: "Exams", href: "/exams", count: "4" },
    ],
  },
];

function renderSidebar(layout?: "full" | "rail" | "responsive") {
  return render(
    <AppSidebar
      layout={layout}
      logo={<span>logo</span>}
      roleLabel="Proctor"
      navLabel="Dashboard"
      sections={SECTIONS}
      workspace={<SidebarWorkspace initials="K" name="KRU · Kostanay" detail="Faculty of Mathematics" />}
      note={<SidebarNote title="On device" body="Only events travel." />}
      user={<SidebarUser initials="AS" name="Aigerim Sadykova" detail="Proctor" />}
    />,
  );
}

describe("NavItem", () => {
  it("is a link that marks the current page", () => {
    render(<NavItem icon="exam" label="Exams" href="/exams" count="4" active />);
    const link = screen.getByRole("link", { name: "Exams 4" });
    expect(link.getAttribute("href")).toBe("/exams");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.className).toContain("bg-brand-subtle");
  });

  it("dims the icon and label when not active", () => {
    render(<NavItem icon="exam" label="Exams" href="/exams" />);
    const link = screen.getByRole("link", { name: "Exams" });
    expect(link.getAttribute("aria-current")).toBeNull();
    expect(link.querySelector("svg")?.getAttribute("class")).toContain("opacity-72");
  });

  it("keeps the label as the accessible name in the rail", () => {
    render(<NavItem icon="exam" label="Exams" href="/exams" count="4" layout="rail" />);
    const link = screen.getByRole("link", { name: /Exams/ });
    expect(within(link).getByText("Exams").className).toContain("sr-only");
    expect(within(link).getByText("4").className).toContain("hidden");
  });

  it("shows the label as a tooltip in the rail", async () => {
    render(<NavItem icon="exam" label="Exams" href="/exams" layout="rail" />);
    fireEvent.focus(screen.getByRole("link", { name: "Exams" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain("Exams");
  });

  it("has no tooltip in the full sidebar", () => {
    render(<NavItem icon="exam" label="Exams" href="/exams" layout="full" />);
    fireEvent.focus(screen.getByRole("link", { name: "Exams" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("renders through a custom link component", () => {
    const seen: string[] = [];
    function FakeLink({
      href,
      children,
      className,
    }: {
      href: string;
      children?: ReactNode;
      className?: string;
    }) {
      seen.push(href);
      return (
        <a href={href} className={className}>
          {children}
        </a>
      );
    }
    render(<NavItem icon="exam" label="Exams" href="/exams" linkAs={FakeLink} />);
    expect(seen).toEqual(["/exams"]);
  });
});

describe("AppSidebar", () => {
  it("renders a named navigation landmark with the items", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Dashboard" });
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
    expect(within(nav).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("complementary").dataset.layout).toBe("responsive");
    expect(screen.getByRole("complementary").className).toContain("xl:w-64");
  });

  it("collapses to the icon rail", () => {
    renderSidebar("rail");
    const aside = screen.getByRole("complementary");
    expect(aside.className).toContain("w-18");
    expect(screen.getByText("Workspace").className).toContain("sr-only");
    expect(screen.getByText("Overview").className).toContain("sr-only");
    expect(screen.getByText("On device").closest(".hidden")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Aigerim Sadykova/ })).toBeDefined();
  });

  it("uses the full width when asked", () => {
    renderSidebar("full");
    expect(screen.getByRole("complementary").className).toContain("w-64");
    expect(screen.getByText("Overview").className).not.toContain("sr-only");
  });
});

describe("Sidebar parts", () => {
  it("makes workspace and user buttons that can open menus", () => {
    const onWorkspace = vi.fn();
    const onUser = vi.fn();
    render(
      <>
        <SidebarWorkspace initials="K" name="KRU · Kostanay" onClick={onWorkspace} />
        <SidebarUser initials="AS" name="Aigerim Sadykova" detail="Proctor" onClick={onUser} />
      </>,
    );
    const workspace = screen.getByRole("button", { name: /KRU · Kostanay/ });
    expect(workspace.getAttribute("type")).toBe("button");
    fireEvent.click(workspace);
    fireEvent.click(screen.getByRole("button", { name: /Aigerim Sadykova/ }));
    expect(onWorkspace).toHaveBeenCalledOnce();
    expect(onUser).toHaveBeenCalledOnce();
  });
});

describe("AppTopBar and SearchField", () => {
  it("renders the title as the page heading", () => {
    render(
      <AppTopBar
        breadcrumb="Exams / Mathematics 2"
        title="Live wall"
        actions={<button type="button">x</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Live wall" })).toBeDefined();
    expect(screen.getByText("Exams / Mathematics 2")).toBeDefined();
    expect(screen.getByRole("banner")).toBeDefined();
  });

  it("names the search box and reports typing", () => {
    const onChange = vi.fn();
    render(<SearchField label="Search" placeholder="Search students, exams" onChange={onChange} />);
    const box = screen.getByRole("searchbox", { name: "Search" });
    expect(box.getAttribute("placeholder")).toBe("Search students, exams");
    fireEvent.change(box, { target: { value: "Dias" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("can be disabled", () => {
    render(<SearchField label="Search" disabled />);
    expect(screen.getByRole("searchbox")).toHaveProperty("disabled", true);
  });
});

describe("TabGroup and Tab", () => {
  function Language({ onValueChange }: { onValueChange: (value: string) => void }) {
    return (
      <TabGroup aria-label="Language" value="en" onValueChange={onValueChange}>
        <Tab value="kk">ҚАЗ</Tab>
        <Tab value="ru">РУС</Tab>
        <Tab value="en">ENG</Tab>
      </TabGroup>
    );
  }

  it("marks exactly one tab active and reports a new choice", () => {
    const onValueChange = vi.fn();
    render(<Language onValueChange={onValueChange} />);
    const group = screen.getByRole("radiogroup", { name: "Language" });
    const english = within(group).getByRole("radio", { name: "ENG" });
    expect(english.getAttribute("aria-checked")).toBe("true");
    expect(within(group).getByRole("radio", { name: "ҚАЗ" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(english);
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole("radio", { name: "РУС" }));
    expect(onValueChange).toHaveBeenCalledWith("ru");
  });

  it("moves focus with the arrow keys and keeps one tab stop", async () => {
    render(<Language onValueChange={() => {}} />);
    const english = screen.getByRole("radio", { name: "ENG" });
    const russian = screen.getByRole("radio", { name: "РУС" });
    english.focus();
    fireEvent.focus(english);
    expect(english.tabIndex).toBe(0);
    expect(russian.tabIndex).toBe(-1);
    fireEvent.keyDown(english, { key: "ArrowLeft" });
    await vi.waitFor(() => expect(document.activeElement).toBe(russian));
  });

  it("disables a tab", () => {
    const onValueChange = vi.fn();
    render(
      <TabGroup aria-label="Filter" value="a" onValueChange={onValueChange}>
        <Tab value="a">A</Tab>
        <Tab value="b" disabled>
          B
        </Tab>
      </TabGroup>,
    );
    const b = screen.getByText("B");
    expect(b).toHaveProperty("disabled", true);
    fireEvent.click(b);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("Step", () => {
  it("shows a tick when done and the number otherwise", () => {
    const { rerender, container } = render(<Step state="done" number="1" label="Camera" />);
    expect(screen.queryByText("1")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    rerender(<Step state="current" number="1" label="Camera" />);
    expect(screen.getByText("1")).toBeDefined();
    expect(container.firstElementChild?.getAttribute("aria-current")).toBe("step");
    rerender(<Step state="upcoming" number="2" label="Identity" />);
    expect(container.firstElementChild?.getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("Identity").className).toContain("opacity-50");
  });
});

describe("Window chrome", () => {
  it("draws macOS with the title between spacers and Windows with buttons last", () => {
    const { rerender } = render(
      <AppTitleBar
        os="macos"
        title="Üki · Mathematics 2 · Midterm"
        languageSwitch={<span>lang</span>}
        face={<span>face</span>}
      />,
    );
    const bar = screen.getByRole("banner");
    expect(bar.dataset.os).toBe("macos");
    expect(bar.className).toContain("[-webkit-app-region:drag]");
    rerender(
      <AppTitleBar
        os="windows"
        title="Üki · Mathematics 2 · Midterm"
        appIcon={<span>mark</span>}
        windowControls={
          <WindowButtons labels={{ minimize: "Minimize", maximize: "Maximize", close: "Close" }} />
        }
      />,
    );
    expect(screen.getByRole("banner").dataset.os).toBe("windows");
    expect(screen.getByRole("banner").lastElementChild?.querySelectorAll("button")).toHaveLength(3);
  });

  it("disables window buttons without a handler", () => {
    const onMinimize = vi.fn();
    render(
      <WindowButtons
        labels={{ minimize: "Minimize", maximize: "Maximize", close: "Close" }}
        onMinimize={onMinimize}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Close" })).toHaveProperty("disabled", true);
  });

  it("draws decorative window buttons without buttons", () => {
    const { container } = render(<WindowButtons decorative />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws a browser that cannot be operated", () => {
    render(
      <BrowserTopBar
        os="windows"
        tabTitle="Physics 1 · Quiz 3"
        url="exam.kru.test/physics-1/quiz-3"
        otherTabs={[{ id: "notes", icon: "file-text", title: "Lecture 7 notes" }]}
        windowControls={<WindowButtons decorative />}
      />,
    );
    expect(screen.getByText("Physics 1 · Quiz 3")).toBeDefined();
    expect(screen.getByText("exam.kru.test/physics-1/quiz-3")).toBeDefined();
    expect(screen.getByText("Lecture 7 notes")).toBeDefined();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
