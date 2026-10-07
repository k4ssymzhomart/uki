// Development gallery: every Data display component in every variant and state, next to its Figma
// screenshot. Sample strings are the Figma defaults; this file is not product UI.

import { type ReactNode, useState } from "react";
import { assetUrl } from "../art/asset-url.ts";
import { Mascot } from "../art/mascot.tsx";
import { Button } from "../controls/button.tsx";
import { Avatar } from "./avatar.tsx";
import { Badge } from "./badge.tsx";
import { CheckRow } from "./check-row.tsx";
import { Chip } from "./chip.tsx";
import { rowExamColumns, rowLobbyColumns } from "./columns.ts";
import { Count } from "./count.tsx";
import { EventRow } from "./event-row.tsx";
import { EvidenceCard } from "./evidence-card.tsx";
import figmaChip from "./figma/8-26.png";
import figmaAvatar from "./figma/39-2045.png";
import figmaCount from "./figma/39-2054.png";
import figmaStatTile from "./figma/40-2061.png";
import figmaCheckRow from "./figma/46-2089.png";
import figmaEventRow from "./figma/46-2165.png";
import figmaEvidenceCard from "./figma/46-2166.png";
import figmaRowExam from "./figma/50-2153.png";
import figmaRowSession from "./figma/50-2191.png";
import figmaRowLobby from "./figma/50-2214.png";
import figmaBadge from "./figma/89-2454.png";
import figmaHeaderCell from "./figma/149-2763.png";
import figmaEmptyState from "./figma/149-2792.png";
import figmaSkeletonRow from "./figma/149-2847.png";
import { RowAction } from "./row-action.tsx";
import { RowExam } from "./row-exam.tsx";
import { RowLobby } from "./row-lobby.tsx";
import { RowSession } from "./row-session.tsx";
import type { SortDirection } from "./sort.ts";
import { StatTile } from "./stat-tile.tsx";
import { Table } from "./table.tsx";
import { TableEmptyState } from "./table-empty-state.tsx";
import { TableHeaderCell } from "./table-header-cell.tsx";
import { TableSkeletonRow } from "./table-skeleton-row.tsx";

export const title = "Data";
export const order = 3;

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

function SortableHeader() {
  const [sort, setSort] = useState<SortDirection>("none");
  return <TableHeaderCell label="Student" sort={sort} onSortChange={setSort} />;
}

export default function DataGallery() {
  return (
    <div className="flex flex-col gap-10">
      <Specimen name="Chip · 8:26" figma={figmaChip}>
        <div className="flex flex-wrap items-center gap-11 bg-canvas p-4">
          <Chip status="ok">gaze on screen</Chip>
          <Chip status="warn">gaze on screen</Chip>
          <Chip status="flag">gaze on screen</Chip>
          <Chip status="idle">gaze on screen</Chip>
        </div>
        <div data-theme="dark" className="flex flex-wrap items-center gap-11 bg-canvas p-4 text-fg-primary">
          <Chip status="ok">gaze on screen</Chip>
          <Chip status="warn">gaze on screen</Chip>
          <Chip status="flag">gaze on screen</Chip>
          <Chip status="idle">gaze on screen</Chip>
        </div>
      </Specimen>

      <Specimen name="Badge · 89:2454" figma={figmaBadge}>
        <div className="flex flex-wrap items-center gap-10 p-4">
          <Badge tone="brand">Ready</Badge>
          <Badge tone="ink">Ready</Badge>
          <Badge tone="neutral">Ready</Badge>
          <Badge tone="warn">Ready</Badge>
          <Badge tone="ok">Ready</Badge>
        </div>
      </Specimen>

      <Specimen name="Count · 39:2054" figma={figmaCount}>
        <div className="flex flex-wrap items-center gap-6 p-4">
          <Count tone="neutral">3</Count>
          <Count tone="flag">3</Count>
          <Count tone="warn">3</Count>
          <Count tone="brand">3</Count>
          <Count tone="neutral">128</Count>
        </div>
      </Specimen>

      <Specimen name="Avatar · 39:2045" figma={figmaAvatar}>
        <div className="flex flex-wrap items-center gap-6 p-4">
          <Avatar tone="lime" initials="AB" />
          <Avatar tone="paper" initials="AB" />
          <Avatar tone="ink" initials="AB" />
          <Avatar tone="paper" size="md" initials="DK" />
          <Avatar tone="ink" size="lg" initials="AS" />
        </div>
      </Specimen>

      <Specimen name="Stat tile · 40:2061" figma={figmaStatTile}>
        <div className="flex flex-wrap gap-4 bg-canvas p-4">
          <StatTile className="w-65" label="Live now" value="128" caption="3 groups · 2 proctors" />
          <StatTile className="w-65" label="Needs review" value="7" />
        </div>
      </Specimen>

      <Specimen name="Check row · 46:2089" figma={figmaCheckRow}>
        <div className="flex w-138 flex-col gap-4 bg-canvas p-4">
          <CheckRow
            status="pass"
            title="Camera"
            detail="One face, good light, lens not covered."
            statusLabel="Ready"
          />
          <CheckRow
            status="fail"
            title="Camera"
            detail="One face, good light, lens not covered."
            statusLabel="Fix this"
          />
          <CheckRow
            status="running"
            title="Camera"
            detail="One face, good light, lens not covered."
            statusLabel="Checking"
          />
        </div>
      </Specimen>

      <Specimen name="Event row · 46:2165" figma={figmaEventRow}>
        <div className="flex flex-wrap gap-6">
          {(["light", "dark"] as const).map((theme) => (
            <div
              key={theme}
              data-theme={theme}
              className="flex w-105 flex-col gap-4 bg-canvas p-4 text-fg-primary"
            >
              {(["info", "ok", "warn", "flag"] as const).map((kind) => (
                <EventRow
                  key={kind}
                  kind={kind}
                  kindLabel={kind}
                  time="10:47:10"
                  dateTime="2026-10-09T05:47:10Z"
                  title="Phone in frame"
                  detail="Confidence 0.94 · held 6 s"
                />
              ))}
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen name="Evidence card · 46:2166" figma={figmaEvidenceCard}>
        <div className="flex flex-wrap gap-6">
          {(["light", "dark"] as const).map((theme) => (
            <div key={theme} data-theme={theme} className="bg-canvas p-4 text-fg-primary">
              <EvidenceCard
                className="w-65"
                chipLabel="phone 0.94"
                time="10:47:10"
                title="Phone in frame"
                detail="Held for 6 s · frame 1 of 3"
              />
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen name="Row/Lobby · 50:2214" figma={figmaRowLobby}>
        <Table aria-label="Lobby" className="w-280">
          <thead>
            <tr className="bg-subtle">
              <TableHeaderCell
                className={rowLobbyColumns.student}
                label="Student"
                sort="asc"
                onSortChange={() => {}}
              />
              <TableHeaderCell className={rowLobbyColumns.step} label="Where they are" />
              <TableHeaderCell className={rowLobbyColumns.device} label="Device" />
              <TableHeaderCell className={rowLobbyColumns.status} label="Status" />
              <TableHeaderCell label="" />
            </tr>
          </thead>
          <tbody>
            <RowLobby
              initials="DK"
              name="Dias Kenzhebekov"
              studentId="20231044"
              step="Identity check"
              stepDetail="Card unreadable · retry 2 of 3"
              device="Windows 11 · Wi-Fi"
              status="warn"
              statusLabel="Needs help"
              action={<RowAction icon="message">Message</RowAction>}
            />
            <RowLobby
              initials="YT"
              name="Yerlan Tokhtarov"
              studentId="20230877"
              step="Not joined"
              stepDetail="Invite email bounced"
              device="—"
              status="idle"
              statusLabel="Not joined"
              action={
                <RowAction icon="message" className="shadow-focus">
                  Focus
                </RowAction>
              }
            />
          </tbody>
        </Table>
      </Specimen>

      <Specimen name="Row/Exam · 50:2153" figma={figmaRowExam}>
        <Table aria-label="Exams" className="w-280">
          <thead>
            <tr className="bg-subtle">
              <TableHeaderCell className={rowExamColumns.exam} label="Exam" />
              <TableHeaderCell
                className={rowExamColumns.when}
                label="When"
                sort="desc"
                onSortChange={() => {}}
              />
              <TableHeaderCell className={rowExamColumns.students} label="Students" />
              <TableHeaderCell className={rowExamColumns.checks} label="Checks" />
              <TableHeaderCell className={rowExamColumns.status} label="Status" />
              <TableHeaderCell label="" />
            </tr>
          </thead>
          <tbody>
            <RowExam
              exam="Mathematics 2 · Midterm"
              examDetail="Group 204 · 2 proctors"
              when="Fri 9 Oct · 10:00"
              duration="90 min"
              students="128"
              status="idle"
              statusLabel="Scheduled"
              checkLabels={{ lock: "Üki Lock", gaze: "Gaze", phone: "Phone", id: "Student card" }}
            />
            <RowExam
              exam="Physics 1 · Quiz 3"
              examDetail="Group 112 · 1 proctor"
              when="Fri 9 Oct · 14:00"
              duration="30 min"
              students="42"
              checks={{ lock: false, id: false }}
              status="ok"
              statusLabel="Live"
              href="#row-exam"
              className="bg-canvas"
            />
          </tbody>
        </Table>
      </Specimen>

      <Specimen name="Row/Session · 50:2191" figma={figmaRowSession}>
        <Table aria-label="Sessions" className="w-280">
          <tbody>
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
                  <a href="#row-session">Review</a>
                </RowAction>
              }
            />
          </tbody>
        </Table>
      </Specimen>

      <Specimen name="Table/Header cell · 149:2763" figma={figmaHeaderCell}>
        <Table aria-label="Header cells" className="w-auto">
          <thead>
            <tr className="bg-canvas">
              <TableHeaderCell className="w-36" label="Student" sort="none" onSortChange={() => {}} />
              <TableHeaderCell className="w-36" label="Student" sort="asc" onSortChange={() => {}} />
              <TableHeaderCell className="w-36" label="Student" sort="desc" onSortChange={() => {}} />
              <TableHeaderCell className="w-36" label="Student" />
              <SortableHeader />
            </tr>
          </thead>
        </Table>
      </Specimen>

      <Specimen name="Table/Empty state · 149:2792" figma={figmaEmptyState}>
        <div className="w-280 bg-canvas">
          <TableEmptyState
            art={<Mascot pose="approve" size={128} />}
            title="Nothing to review"
            body="All 125 sessions are clear or decided. New flags show up here."
            action={<Button variant="secondary">Open the live wall</Button>}
          />
        </div>
      </Specimen>

      <Specimen name="Table/Skeleton row · 149:2847" figma={figmaSkeletonRow}>
        <Table aria-label="Loading" aria-busy="true" className="w-280">
          <tbody>
            <TableSkeletonRow />
            <TableSkeletonRow />
          </tbody>
        </Table>
      </Specimen>
    </div>
  );
}
