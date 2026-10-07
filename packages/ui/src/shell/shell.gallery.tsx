// Development gallery: every Shell and navigation component in every variant and state, next to its
// Figma screenshot. Sample strings are the Figma defaults; this file is not product UI.

import { type ReactNode, useState } from "react";
import { assetUrl } from "../art/asset-url.ts";
import { Face } from "../art/face.tsx";
import { Logo } from "../art/logo.tsx";
import { IconButton } from "../controls/icon-button.tsx";
import { Avatar } from "../data/avatar.tsx";
import { LockToolbarIcon } from "../lock/lock-toolbar-icon.tsx";
import { AppSidebar, type SidebarSection } from "./app-sidebar.tsx";
import { AppTitleBar } from "./app-title-bar.tsx";
import { AppTopBar } from "./app-top-bar.tsx";
import macBrowserControls from "./assets/mac-window-controls-browser.svg";
import macTitleBarControls from "./assets/mac-window-controls-title-bar.svg";
import { BrowserTopBar } from "./browser-top-bar.tsx";
import figmaNavItem from "./figma/40-2055.png";
import figmaTab from "./figma/40-2060.png";
import figmaStep from "./figma/46-2106.png";
import figmaSidebar from "./figma/47-2070.png";
import figmaTopBar from "./figma/47-2201.png";
import figmaTitleBar from "./figma/150-13352.png";
import figmaBrowserTopBar from "./figma/150-13406.png";
import { NavItem } from "./nav-item.tsx";
import { SearchField } from "./search-field.tsx";
import { SidebarNote } from "./sidebar-note.tsx";
import { SidebarUser } from "./sidebar-user.tsx";
import { SidebarWorkspace } from "./sidebar-workspace.tsx";
import { Step } from "./step.tsx";
import { Tab } from "./tab.tsx";
import { TabGroup } from "./tab-group.tsx";
import { WindowButtons } from "./window-buttons.tsx";

export const title = "Shell";
export const order = 4;

function Specimen({ name, figma, children }: { name: string; figma: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-t border-line-default pt-6" data-specimen={name}>
      <h3 className="type-mono-tag">{name}</h3>
      <div className="flex flex-col gap-2">
        <span className="opacity-58 type-ui-caption">Figma</span>
        <img src={assetUrl(figma)} alt="" className="max-w-full self-start" />
      </div>
      <div className="flex flex-col gap-2">
        <span className="opacity-58 type-ui-caption">Code</span>
        {children}
      </div>
    </div>
  );
}

const SECTIONS: readonly SidebarSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "overview", icon: "layout-grid", label: "Overview", href: "#overview" },
      { id: "exams", icon: "exam", label: "Exams", href: "#exams", count: "4", active: true },
      { id: "live", icon: "eyes", label: "Live", href: "#live", count: "128" },
      { id: "review", icon: "flag", label: "Review", href: "#review", count: "7" },
      { id: "reports", icon: "report", label: "Reports", href: "#reports" },
      { id: "students", icon: "users", label: "Students", href: "#students" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { id: "settings", icon: "settings", label: "Settings", href: "#settings" },
      { id: "privacy", icon: "shield", label: "Privacy", href: "#privacy" },
    ],
  },
];

function Sidebar({ layout }: { layout: "full" | "rail" }) {
  return (
    <AppSidebar
      layout={layout}
      className="h-240"
      logo={<Logo variant="wordmark-ink" className="h-7.5 w-auto" />}
      logoCompact={<Logo variant="eyes" className="h-7.5 w-auto" />}
      roleLabel="Proctor"
      workspace={<SidebarWorkspace initials="K" name="KRU · Kostanay" detail="Faculty of Mathematics" />}
      sections={SECTIONS}
      navLabel="Dashboard"
      note={
        <SidebarNote
          title="On device"
          body="Video never leaves student laptops. Only events and flagged frames travel."
        />
      }
      user={<SidebarUser initials="AS" name="Aigerim Sadykova" detail="Proctor · Group 204" />}
    />
  );
}

function LanguageSwitch() {
  const [language, setLanguage] = useState("en");
  return (
    <TabGroup aria-label="Language" value={language} onValueChange={setLanguage}>
      <Tab value="kk">ҚАЗ</Tab>
      <Tab value="ru">РУС</Tab>
      <Tab value="en">ENG</Tab>
    </TabGroup>
  );
}

const WINDOW_LABELS = { minimize: "Minimize", maximize: "Maximize", close: "Close" };

export default function ShellGallery() {
  return (
    <div className="flex flex-col gap-10">
      <Specimen name="Nav item · 40:2055" figma={figmaNavItem}>
        <ul className="flex w-64 flex-col gap-4 bg-canvas p-4">
          <li>
            <NavItem icon="exam" label="Exams" href="#default" count="3" />
          </li>
          <li>
            <NavItem icon="exam" label="Exams" href="#active" count="3" active />
          </li>
          <li>
            <NavItem icon="exam" label="Exams · hover" href="#hover" count="3" className="bg-hover" />
          </li>
          <li>
            <NavItem icon="exam" label="Exams · pressed" href="#pressed" className="bg-pressed" />
          </li>
          <li>
            <NavItem icon="exam" label="Exams · focus" href="#focus" className="shadow-focus" />
          </li>
          <li className="w-10">
            <NavItem icon="exam" label="Exams" href="#rail" count="3" layout="rail" />
          </li>
        </ul>
      </Specimen>

      <Specimen name="Tab · 40:2060" figma={figmaTab}>
        <div className="flex flex-wrap items-center gap-6 bg-canvas p-4">
          <LanguageSwitch />
          <TabGroup aria-label="Filter" value="need-help" variant="plain">
            <Tab value="need-help">Need help · 3</Tab>
            <Tab value="not-joined" className="text-fg-primary">
              Hover
            </Tab>
            <Tab value="ready" className="shadow-focus">
              Focus
            </Tab>
            <Tab value="all" disabled>
              Disabled
            </Tab>
          </TabGroup>
        </div>
      </Specimen>

      <Specimen name="Step · 46:2106" figma={figmaStep}>
        <ol className="flex flex-col gap-5 bg-canvas p-4">
          <li>
            <Step state="done" number="1" label="Camera" />
          </li>
          <li>
            <Step state="current" number="1" label="Camera" />
          </li>
          <li>
            <Step state="upcoming" number="1" label="Camera" />
          </li>
        </ol>
      </Specimen>

      <Specimen name="App/Sidebar · 47:2070 (full 256, rail 72)" figma={figmaSidebar}>
        <div className="flex items-start gap-8">
          <Sidebar layout="full" />
          <Sidebar layout="rail" />
        </div>
      </Specimen>

      <Specimen name="App/Top bar · 47:2201" figma={figmaTopBar}>
        <div className="w-296">
          <AppTopBar
            breadcrumb="Exams / Mathematics 2"
            title="Live wall"
            actions={
              <>
                <SearchField label="Search" placeholder="Search students, exams" />
                <IconButton icon="bell" label="Notifications" />
                <Avatar tone="ink" size="lg" initials="AS" />
              </>
            }
          />
        </div>
      </Specimen>

      <Specimen name="App/Title bar · 150:13352" figma={figmaTitleBar}>
        <div className="flex w-320 flex-col gap-4">
          <AppTitleBar
            os="macos"
            title="Üki · Mathematics 2 · Midterm"
            windowControls={<img src={assetUrl(macTitleBarControls)} alt="" className="h-3 w-13" />}
            languageSwitch={<LanguageSwitch />}
            face={<Face state="neutral" className="size-7" />}
          />
          <AppTitleBar
            os="windows"
            title="Üki · Mathematics 2 · Midterm"
            appIcon={<Logo variant="eyes" className="size-4.5 object-contain" />}
            languageSwitch={<LanguageSwitch />}
            face={<Face state="neutral" className="size-7" />}
            windowControls={
              <WindowButtons labels={WINDOW_LABELS} onMinimize={() => {}} onMaximize={() => {}} />
            }
          />
        </div>
      </Specimen>

      <Specimen name="Browser/Top bar · 150:13406" figma={figmaBrowserTopBar}>
        <div className="flex w-320 flex-col gap-4">
          {(["macos", "windows"] as const).map((os) => (
            <BrowserTopBar
              key={os}
              os={os}
              tabTitle="Physics 1 · Quiz 3"
              url="exam.kru.test/physics-1/quiz-3"
              otherTabs={[
                { id: "notes", icon: "file-text", title: "Lecture 7 notes" },
                { id: "chat", icon: "message", title: "Group chat" },
                { id: "inbox", icon: "globe", title: "Inbox" },
              ]}
              windowControls={
                os === "macos" ? (
                  <img src={assetUrl(macBrowserControls)} alt="" className="h-5.75 w-16.5" />
                ) : (
                  <WindowButtons decorative />
                )
              }
              extension={<LockToolbarIcon state="ready" />}
            />
          ))}
        </div>
      </Specimen>
    </div>
  );
}
