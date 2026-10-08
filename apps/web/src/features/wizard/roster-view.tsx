"use client";

import { type ExamDraft, type ProctorAssignment, type RosterCheck, RosterRow } from "@uki/contracts";
import {
  Button,
  Chip,
  Icon,
  initials,
  RowLobby,
  rowLobbyColumns,
  SearchField,
  shortName,
  Tab,
  TabGroup,
  Table,
  TableHeaderCell,
} from "@uki/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  badRows,
  checkRosterCells,
  errorReportCsv,
  parseRosterCsv,
  problemKey,
  type RosterCells,
  replaceRow,
  skipRows,
} from "./roster-csv.ts";
import { InviteFix, RowActionButton, RowActionTrigger, RowFix } from "./roster-fix.tsx";
import { ProctorsCard } from "./roster-proctors.tsx";
import { fixInviteEmail, importRoster, type WizardError } from "./wizard-actions.ts";
import type { RosterEntry } from "./wizard-data.ts";
import { WizardFrame } from "./wizard-frame.tsx";
import {
  inTab,
  inviteAction,
  inviteChip,
  matchesSearch,
  needsFix,
  nextStep,
  previousStep,
  proctorOfSeat,
  ROSTER_TABS,
  type RosterTab,
  SEND_INVITES_READY,
  stepHref,
  type WizardGroup,
  type WizardProctor,
} from "./wizard-model.ts";

export type RosterViewProps = {
  exam: ExamDraft;
  roster: readonly RosterEntry[];
  assignments: readonly ProctorAssignment[];
  proctors: readonly WizardProctor[];
  groups: readonly WizardGroup[];
};

/** The file being worked on in this visit: the last one imported, or one with bad rows (0.3a). */
type FileState =
  | { kind: "none" }
  | { kind: "unreadable"; name: string; reason: "empty" | "tooMany" | "unreadable" }
  | { kind: "issues"; name: string; rows: RosterCells[]; check: RosterCheck }
  | { kind: "importing"; name: string; total: number };

const FILE_NAME_KEY = "uki.wizard.rosterFile.";

function rememberFile(examId: string, name: string, valid: number, total: number) {
  try {
    window.localStorage.setItem(FILE_NAME_KEY + examId, JSON.stringify({ name, valid, total }));
  } catch {
    // A private window keeps no storage; the card then shows "Roster".
  }
}

function rememberedFile(examId: string): { name: string; valid: number; total: number } | null {
  try {
    const raw = window.localStorage.getItem(FILE_NAME_KEY + examId);
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    if (typeof value !== "object" || value === null) return null;
    const { name, valid, total } = value as Record<string, unknown>;
    return typeof name === "string" && typeof valid === "number" && typeof total === "number"
      ? { name, valid, total }
      : null;
  } catch {
    return null;
  }
}

/**
 * 0.3 Roster and proctors (Figma 51:2050), 0.3a Roster errors (160:12932) and 0.3b Fix email
 * (160:13301). A dropped or chosen CSV is read in the browser with Papa Parse and every row checked
 * with RosterRow; with bad rows, 0.3a lists them with what to fix and nothing is written until each is
 * fixed (Edit) or skipped. A clean file goes to import_roster at once, which replaces the roster, so
 * importing the same file twice adds nobody. The proctors card writes assign_proctors.
 */
export function RosterView({
  exam,
  roster,
  assignments: initialAssignments,
  proctors,
  groups,
}: RosterViewProps) {
  const t = useTranslations("dashboard.wizard");
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<FileState>({ kind: "none" });
  const [importError, setImportError] = useState<{ error: WizardError; row?: number } | null>(null);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [tab, setTab] = useState<RosterTab>("all");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lastFile, setLastFile] = useState<{ name: string; valid: number; total: number } | null>(null);
  const codes = groups.map((group) => group.code);
  const scheduled = exam.status === "scheduled";

  useEffect(() => setLastFile(rememberedFile(exam.id)), [exam.id]);
  useEffect(() => setAssignments(initialAssignments), [initialAssignments]);

  const runImport = async (name: string, rows: readonly RosterCells[], total: number) => {
    const valid = rows.flatMap((cells) => {
      const parsed = RosterRow.safeParse(cells);
      return parsed.success ? [parsed.data] : [];
    });
    setFile({ kind: "importing", name, total });
    setImportError(null);
    const result = await importRoster({ exam_id: exam.id, rows: valid });
    if (result.ok) {
      rememberFile(exam.id, name, valid.length, total);
      setLastFile({ name, valid: valid.length, total });
      setFile({ kind: "none" });
      router.refresh();
    } else {
      setFile({ kind: "none" });
      setImportError(
        result.row === undefined ? { error: result.error } : { error: result.error, row: result.row },
      );
    }
  };

  /** Checks the rows; with no problem left they are imported, otherwise 0.3a shows them. */
  const settle = (name: string, rows: RosterCells[]) => {
    const check = checkRosterCells(rows, codes);
    if (check.issues.length === 0) void runImport(name, rows, rows.length);
    else setFile({ kind: "issues", name, rows, check });
  };

  const readFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    const text = await chosen.text();
    const parsed = parseRosterCsv(text);
    if (!parsed.ok) {
      setFile({ kind: "unreadable", name: chosen.name, reason: parsed.reason });
      return;
    }
    settle(chosen.name, parsed.rows);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files[0]);
  };
  const dropProps = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  const chooser = (
    <input
      ref={input}
      type="file"
      accept=".csv,text/csv"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        void readFile(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );

  const go = (step: ReturnType<typeof nextStep>) => {
    if (step) router.push(stepHref(exam.id, step));
  };

  if (file.kind === "issues") {
    const bad = badRows(file.rows, file.check.issues);
    const validCount = file.check.valid.length;
    const download = () => {
      const csv = errorReportCsv(
        file.rows,
        file.check.issues,
        (issue) => t(`roster.problem.${problemKey(issue)}`, { value: issue.value }),
        [
          t("roster.errors.reportHeader.row"),
          "student_number",
          "full_name",
          "email",
          "group",
          "locale",
          t("roster.errors.reportHeader.column"),
          t("roster.errors.reportHeader.problem"),
        ],
      );
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = t("roster.errors.reportFile");
      link.click();
      URL.revokeObjectURL(url);
    };
    return (
      <WizardFrame
        examTitle={exam.title}
        step="roster"
        footer={t("roster.footerErrors", { count: bad.length })}
        actions={
          <>
            <Button variant="ghost" onClick={() => go(previousStep("roster", exam.mode))}>
              {t("back")}
            </Button>
            <Button disabled>{t("roster.next")}</Button>
          </>
        }
      >
        {chooser}
        <section
          aria-labelledby={`${id}-file`}
          className="flex w-full flex-col gap-4 rounded-card bg-surface p-5 inset-ring-2 inset-ring-flag"
          {...dropProps}
        >
          <div className="flex w-full items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-flag-subtle">
              <Icon name="upload" className="size-6" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id={`${id}-file`} className="truncate type-card-title">
                {file.name}
              </h2>
              <p className="opacity-72 type-card-caption">
                {t("roster.errors.summary", { valid: validCount, total: file.rows.length, bad: bad.length })}
              </p>
            </div>
          </div>
          <ul className="flex w-full flex-col rounded-sm border border-line-default">
            {bad.map((item, index) => {
              const cells = file.rows[item.row - 1] as RosterCells;
              const first = item.issues[0];
              return (
                <li
                  key={item.row}
                  className={`flex items-center gap-3 px-3.5 py-2.5 ${index > 0 ? "border-t border-line-default" : ""}`}
                >
                  <span aria-hidden="true" className="size-1.75 shrink-0 rounded-pill bg-flag" />
                  <span className="w-16 shrink-0 type-ui-mono">
                    {t("roster.errors.row", { row: item.row })}
                  </span>
                  <span className="w-42.5 shrink-0 truncate type-ui-label">
                    {item.name === "" ? t("roster.errors.noName") : item.name}
                  </span>
                  <span className="min-w-0 flex-1 opacity-72 type-ui-label">
                    {first ? t(`roster.problem.${problemKey(first)}`, { value: first.value }) : null}
                  </span>
                  <RowFix
                    row={item.row}
                    cells={cells}
                    issues={item.issues}
                    groups={codes}
                    onSave={(changed) => settle(file.name, replaceRow(file.rows, item.row, changed))}
                    trigger={<RowActionTrigger label={t("roster.action.edit")} />}
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex w-full items-center justify-end gap-2.5">
            <Button variant="ghost" onClick={download}>
              {t("roster.errors.download")}
            </Button>
            <Button
              variant="secondary"
              disabled={validCount === 0}
              onClick={() =>
                void runImport(
                  file.name,
                  skipRows(
                    file.rows,
                    bad.map((item) => item.row),
                  ),
                  file.rows.length,
                )
              }
            >
              {t("roster.errors.skip", { count: bad.length })}
            </Button>
            <Button onClick={() => input.current?.click()}>{t("roster.errors.upload")}</Button>
          </div>
        </section>
        <StudentsCard
          title={t("roster.students.titleValid", { count: validCount })}
          beforeImport
          fixCount={bad.length}
          rows={file.rows.map((cells, index) => {
            const row = index + 1;
            const issues = file.check.issues.filter((issue) => issue.row === row);
            const seat = file.check.validRows.indexOf(row) + 1;
            return {
              key: `row-${row}`,
              name: cells.full_name,
              number: cells.student_number,
              group: cells.group,
              detail: null,
              proctor: seat > 0 ? (proctorOfSeat(assignments, seat)?.full_name ?? null) : null,
              status: "parsed" as const,
              fix: issues.length > 0,
              action: (
                <RowFix
                  row={row}
                  cells={cells}
                  issues={issues}
                  groups={codes}
                  onSave={(changed) => settle(file.name, replaceRow(file.rows, row, changed))}
                  trigger={<RowActionTrigger label={t("roster.action.edit")} />}
                />
              ),
            };
          })}
          tab={tab}
          onTab={setTab}
          query={query}
          onQuery={setQuery}
        />
      </WizardFrame>
    );
  }

  const importing = file.kind === "importing";
  const rosterSize = roster.length;
  const counted = lastFile && lastFile.valid === rosterSize ? lastFile : null;

  return (
    <WizardFrame
      examTitle={exam.title}
      step="roster"
      footer={t("roster.footer")}
      error={
        importError
          ? importError.row !== undefined
            ? t("roster.importError.row", { row: importError.row })
            : t(`error.${importError.error}`)
          : file.kind === "unreadable"
            ? t(
                `roster.file.${file.reason === "empty" ? "emptyFile" : file.reason === "tooMany" ? "tooMany" : "unreadable"}`,
              )
            : null
      }
      actions={
        <>
          <Button variant="ghost" onClick={() => go(previousStep("roster", exam.mode))} disabled={scheduled}>
            {t("back")}
          </Button>
          <Button onClick={() => go(nextStep("roster", exam.mode))} disabled={importing || scheduled}>
            {t("roster.next")}
          </Button>
        </>
      }
    >
      {chooser}
      <div className="flex w-full items-stretch gap-4">
        <section
          aria-labelledby={`${id}-file`}
          aria-busy={importing || undefined}
          className={`flex min-w-0 flex-1 items-center gap-4 rounded-card border-2 border-line-strong border-dashed bg-subtle px-5.5 py-5 ${dragging ? "bg-brand-subtle" : ""}`}
          {...dropProps}
        >
          <span
            className={`flex size-13 shrink-0 items-center justify-center rounded-pill ${rosterSize === 0 && !importing ? "bg-brand" : "bg-brand-subtle"}`}
          >
            <Icon name="upload" className="size-6" />
          </span>
          {rosterSize === 0 && !importing ? (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 id={`${id}-file`} className="type-card-title">
                  {t("roster.empty.title")}
                </h2>
                <p className="opacity-72 type-card-caption">{t("roster.empty.caption")}</p>
              </div>
              <Button variant="secondary" onClick={() => input.current?.click()}>
                {t("roster.empty.choose")}
              </Button>
            </>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-0.75">
                <h2 id={`${id}-file`} className="max-w-full truncate type-card-title">
                  {importing ? file.name : (counted?.name ?? t("roster.file.fallbackName"))}
                </h2>
                <p className="type-card-caption">
                  {importing ? t("roster.file.importing") : t("roster.file.imported", { count: rosterSize })}
                </p>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  disabled={importing}
                  className="cursor-pointer rounded-sm underline outline-none type-label-m focus-visible:shadow-focus"
                >
                  {t("roster.file.replace")}
                </button>
              </div>
              {importing ? null : (
                <Chip status="ok">
                  {t("roster.file.valid", { valid: rosterSize, total: counted?.total ?? rosterSize })}
                </Chip>
              )}
            </>
          )}
        </section>
        <ProctorsCard
          examId={exam.id}
          assignments={assignments}
          proctors={proctors}
          rosterSize={rosterSize}
          onSaved={(saved) => {
            setAssignments(saved);
            router.refresh();
          }}
        />
      </div>
      {rosterSize > 0 ? (
        <StudentsCard
          title={t("roster.students.title", { count: rosterSize })}
          beforeImport={false}
          fixCount={roster.filter((entry) => needsFix(entry.invite?.state ?? entry.invite_status)).length}
          rows={roster.map((entry) => {
            const status = entry.invite?.state ?? entry.invite_status;
            const shown = entry.invite_status === "opened" ? "opened" : status;
            const action = inviteAction(shown);
            const email = entry.invite?.email ?? entry.student.email ?? "";
            return {
              key: entry.student_id,
              name: entry.student.full_name,
              number: entry.student.student_number,
              group: entry.student.group?.code ?? "",
              detail:
                entry.student.programme && entry.student.year
                  ? t("roster.programme", { programme: entry.student.programme, year: entry.student.year })
                  : null,
              proctor: proctorOfSeat(assignments, entry.seat)?.full_name ?? null,
              status: shown,
              fix: needsFix(shown),
              action:
                action === "resend" ? (
                  <RowActionButton
                    label={t("roster.action.resend")}
                    disabled={!SEND_INVITES_READY}
                    title={SEND_INVITES_READY ? undefined : t("review.invitesUnavailable")}
                  />
                ) : (
                  <InviteFix
                    name={entry.student.full_name}
                    email={email}
                    state={shown}
                    scheduled={scheduled}
                    onSave={async (next, keep) => {
                      const result = await fixInviteEmail({
                        exam_id: exam.id,
                        student_id: entry.student_id,
                        email: next,
                        roster: keep,
                      });
                      if (result.ok) router.refresh();
                      return result.ok;
                    }}
                    trigger={
                      <RowActionTrigger
                        label={action === "fixEmail" ? t("roster.action.fixEmail") : t("roster.action.edit")}
                      />
                    }
                  />
                ),
            };
          })}
          tab={tab}
          onTab={setTab}
          query={query}
          onQuery={setQuery}
        />
      ) : null}
    </WizardFrame>
  );
}

type StudentRow = {
  key: string;
  name: string;
  number: string;
  group: string;
  detail: string | null;
  proctor: string | null;
  status: Parameters<typeof inviteChip>[0];
  /** The row needs 0.3a's Edit (a bad row of the file) or 0.3b's Fix email (a bounced invite). */
  fix: boolean;
  action: ReactNode;
};

/** 0.3's Students card (55:2857): the title, the filter tabs, Find a student and the Row/Lobby table. */
function StudentsCard({
  title,
  beforeImport,
  fixCount,
  rows,
  tab,
  onTab,
  query,
  onQuery,
}: {
  title: string;
  /** 0.3a: the rows are the file's, before anything is written. */
  beforeImport: boolean;
  fixCount: number;
  rows: StudentRow[];
  tab: RosterTab;
  onTab: (tab: RosterTab) => void;
  query: string;
  onQuery: (query: string) => void;
}) {
  const t = useTranslations("dashboard.wizard");
  const id = useId();
  const visible = rows.filter(
    (row) =>
      inTab(row, tab, beforeImport) &&
      matchesSearch({ full_name: row.name, student_number: row.number }, query),
  );
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="overflow-clip rounded-card border border-line-default bg-surface"
    >
      <div className="flex items-center gap-3 py-3.5 pr-4 pl-5">
        <h2 id={`${id}-title`} className="type-card-title">
          {title}
        </h2>
        <TabGroup
          variant="plain"
          value={tab}
          onValueChange={(value) => onTab(value as RosterTab)}
          aria-label={t("roster.tab.label")}
        >
          {ROSTER_TABS.map((item) => (
            <Tab key={item} value={item}>
              {item === "needsFix" ? t("roster.tab.needsFix", { count: fixCount }) : t(`roster.tab.${item}`)}
            </Tab>
          ))}
        </TabGroup>
        <div className="flex-1" />
        <SearchField
          label={t("roster.search")}
          placeholder={t("roster.search")}
          className="w-60"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <Table>
        <thead>
          <tr className="bg-subtle">
            <TableHeaderCell
              className={`${rowLobbyColumns.student} h-8.25 py-0`}
              label={t("roster.column.student")}
            />
            <TableHeaderCell
              className={`${rowLobbyColumns.step} h-8.25 py-0`}
              label={t("roster.column.group")}
            />
            <TableHeaderCell
              className={`${rowLobbyColumns.device} h-8.25 py-0`}
              label={t("roster.column.proctor")}
            />
            <TableHeaderCell
              className={`${rowLobbyColumns.status} h-8.25 py-0`}
              label={t("roster.column.invite")}
            />
            <TableHeaderCell
              className="h-8.25 py-0"
              label={<span className="sr-only">{t("roster.column.action")}</span>}
            />
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const chip = inviteChip(row.status);
            return (
              <RowLobby
                key={row.key}
                initials={initials(row.name)}
                name={row.name === "" ? t("roster.errors.noName") : row.name}
                studentId={row.number}
                step={row.group === "" ? t("roster.errors.noName") : t("roster.group", { code: row.group })}
                {...(row.detail ? { stepDetail: row.detail } : {})}
                device={row.proctor ? shortName(row.proctor) : undefined}
                status={chip.status}
                statusLabel={t(`roster.invite.${chip.key}`)}
                action={row.action}
              />
            );
          })}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center opacity-58 type-body-s">
                {t("roster.none")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </Table>
    </section>
  );
}
