"use client";

import { Icon, RowExam, rowExamColumns, StatTile, Tab, TabGroup, Table, TableHeaderCell } from "@uki/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import reportArt from "../../assets/uki-3d-report.png";
import stopwatchArt from "../../assets/uki-3d-stopwatch.png";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import {
  dayOf,
  formatGroupCodes,
  isSameAlmatyDay,
  longWeekdayOf,
  timeOf,
  weekdayOf,
} from "../../lib/format.ts";
import { AppLink } from "../shell/app-link.tsx";
import { PageHeader } from "../shell/page-header.tsx";
import { workspaceShortName } from "../shell/shell-model.ts";
import { useStaff } from "../shell/staff-context.ts";
import { NewExamButton } from "../wizard/new-exam-button.tsx";
import { DataKeptTile } from "./data-kept-popover.tsx";
import {
  coversAllGroups,
  EXAM_FILTERS,
  type ExamFilter,
  examChecks,
  examPhase,
  filterExams,
  type OverviewRow,
  overviewStats,
  statusChip,
} from "./overview-model.ts";

export type OverviewViewProps = {
  rows: readonly OverviewRow[];
  /** Groups the staff member can see, for "All groups". */
  groupCount: number;
  /** Students of the next exam whose invite did not bounce, of its roster. */
  readiness: { ready: number; total: number } | null;
  /** The server's clock when the page rendered, so "Today" matches on both sides. */
  nowMs: number;
  /**
   * The breadcrumb's second part: the faculty the exam office chose in the workspace menu (0.1c), or
   * "All faculties"; undefined for a proctor, who sees their own faculty.
   */
  scopeName?: string;
  /** Exams with a proctor's open change request (0.9a, WP 1.5): their chip reads Change requested. */
  changeRequests?: readonly string[];
};

/**
 * Where an exam's row leads: a draft to its wizard (0.4) for the exam office, otherwise its lobby
 * before the start and its live wall after.
 */
function examHref(row: OverviewRow, office: boolean): string | undefined {
  const phase = examPhase(row.status);
  if (phase === "cancelled") return undefined;
  if (row.status === "draft" && office) return `/exams/${row.id}/edit/details`;
  return `/exams/${row.id}/${phase === "upcoming" ? "lobby" : "live"}`;
}

/**
 * 0.1 Overview (Figma 51:2046): stat cards, the exams table with client-side filters, and the next
 * exam's card with Open lobby, and 0.1b behind Video uploaded. New exam (WP 1.3) shows for the exam
 * office; Import CSV stays hidden (no Phase 1 frame imports exams).
 */
export function OverviewView({
  rows,
  groupCount,
  readiness,
  nowMs,
  scopeName,
  changeRequests = [],
}: OverviewViewProps) {
  const t = useTranslations("dashboard");
  const locale = useDashboardLocale();
  const staff = useStaff();
  const office = staff.role === "exam_office" || staff.role === "admin";
  const [filter, setFilter] = useState<ExamFilter>("all");
  const stats = overviewStats(rows);
  const next = stats.upcoming.next;
  const visible = filterExams(rows, filter);

  const groupsOf = (row: OverviewRow) =>
    coversAllGroups(row.groups, groupCount)
      ? t("common.allGroups")
      : t("common.groups", { count: row.groups.length, codes: formatGroupCodes(row.groups) });
  const detailOf = (row: OverviewRow) => {
    const proctors = t("common.proctors", { count: row.proctor_count });
    return row.groups.length === 0
      ? proctors
      : t("common.withDetail", { main: groupsOf(row), detail: proctors });
  };
  const whenOf = (row: OverviewRow) =>
    isSameAlmatyDay(row.starts_at, nowMs)
      ? t("common.todayTime", { time: timeOf(row.starts_at) })
      : t("common.dateTime", { date: dayOf(row.starts_at, locale), time: timeOf(row.starts_at) });
  const oneLine = (text: string | undefined) =>
    text === undefined ? undefined : <span className="block truncate">{text}</span>;
  const titles = (list: readonly OverviewRow[]) =>
    list.length > 0 ? list.map((row) => row.title).join(" · ") : undefined;
  const scope = scopeName ?? staff.facultyName;
  const breadcrumb = scope
    ? t("common.withDetail", { main: workspaceShortName(staff.workspaceName), detail: scope })
    : staff.workspaceName;

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={t("overview.title")} />
      <main className="flex flex-col gap-6 px-8 pt-7 pb-8">
        <div className="grid grid-cols-4 gap-4">
          <StatTile
            className="items-stretch"
            label={t("overview.stat.upcoming.label")}
            value={stats.upcoming.count}
            caption={
              next
                ? t("overview.stat.upcoming.caption", {
                    course: next.course,
                    weekday: weekdayOf(next.starts_at, locale),
                    time: timeOf(next.starts_at),
                  })
                : undefined
            }
          />
          <StatTile
            className="items-stretch"
            label={t("overview.stat.live.label")}
            value={stats.live.students}
            caption={oneLine(titles(stats.live.exams))}
          />
          <StatTile
            className="items-stretch"
            label={t("overview.stat.review.label")}
            value={stats.review.flags}
            caption={oneLine(titles(stats.review.exams))}
          />
          <DataKeptTile examIds={rows.map((row) => row.id)} />
        </div>

        <section
          id="exams"
          aria-labelledby="exams-title"
          className="scroll-mt-24 overflow-clip rounded-card border border-line-default bg-surface"
        >
          <div className="flex min-h-19 items-center gap-3 py-4 pr-4 pl-5">
            <h2 id="exams-title" className="type-card-title">
              {t("overview.exams.title")}
            </h2>
            <TabGroup
              value={filter}
              onValueChange={(value) => setFilter(value as ExamFilter)}
              aria-label={t("overview.filter.label")}
              variant="plain"
            >
              {EXAM_FILTERS.map((id) => (
                <Tab key={id} value={id}>
                  {t(`overview.filter.${id}`)}
                </Tab>
              ))}
            </TabGroup>
            <div className="flex-1" />
            {office ? <NewExamButton /> : null}
          </div>
          <Table>
            <thead>
              <tr className="bg-subtle">
                <TableHeaderCell
                  className={`${rowExamColumns.exam} h-9 py-0`}
                  label={t("overview.column.exam")}
                />
                <TableHeaderCell
                  className={`${rowExamColumns.when} h-9 py-0`}
                  label={t("overview.column.when")}
                />
                <TableHeaderCell
                  className={`${rowExamColumns.students} h-9 py-0`}
                  label={t("overview.column.students")}
                />
                <TableHeaderCell
                  className={`${rowExamColumns.checks} h-9 py-0`}
                  label={t("overview.column.checks")}
                />
                <TableHeaderCell
                  className={`${rowExamColumns.status} h-9 py-0`}
                  label={t("overview.column.status")}
                />
                <TableHeaderCell
                  className="h-9 py-0"
                  label={<span className="sr-only">{t("overview.column.open")}</span>}
                />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const chip = statusChip(row);
                const changeRequested =
                  examPhase(row.status) === "upcoming" && changeRequests.includes(row.id);
                return (
                  <RowExam
                    key={row.id}
                    exam={row.title}
                    examDetail={detailOf(row)}
                    when={whenOf(row)}
                    duration={t("common.minutes", { minutes: row.duration_min })}
                    students={row.roster_size}
                    checks={examChecks(row.checks)}
                    checkLabels={{
                      lock: t("overview.check.lock"),
                      gaze: t("overview.check.gaze"),
                      phone: t("overview.check.phone"),
                      id: t("overview.check.id"),
                    }}
                    status={changeRequested ? "warn" : chip.status}
                    statusLabel={
                      changeRequested
                        ? t("myExams.status.changeRequested")
                        : t(`overview.status.${chip.key}`, { count: chip.count ?? 0 })
                    }
                    href={examHref(row, office)}
                    linkAs={AppLink}
                  />
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center opacity-58 type-body-s">
                    {t("overview.exams.empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </section>

        {next ? (
          <div className="flex items-stretch gap-4">
            <section className="flex min-w-0 flex-1 items-center gap-4.5 overflow-clip rounded-card bg-brand-subtle py-4 pr-6 pl-5">
              <Image src={stopwatchArt} alt="" className="size-21 shrink-0 object-contain" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <p className="type-mono-tag">
                  {t("overview.next.overline", { date: dayOf(next.starts_at, locale) })}
                </p>
                <h2 className="type-card-title">
                  {t("overview.next.title", { course: next.course, time: timeOf(next.starts_at) })}
                </h2>
                <p className="type-ui-caption">
                  {t("overview.next.body", {
                    time: timeOf(next.lobby_opens_at),
                    students: next.roster_size,
                    proctors: next.proctor_count,
                  })}
                </p>
                <AppLink
                  href={`/exams/${next.id}/lobby`}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-sm outline-none type-label-m focus-visible:shadow-focus"
                >
                  {t("overview.next.openLobby")}
                  <Icon name="arrow-right" className="size-4" />
                </AppLink>
              </div>
            </section>
            {readiness && readiness.total > 0 && next.proctor_count > 0 ? (
              <section className="flex min-w-0 flex-1 items-center gap-4.5 overflow-clip rounded-card border border-line-default bg-surface py-4 pr-6 pl-5">
                <Image src={reportArt} alt="" className="size-21 shrink-0 object-contain" />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <p className="type-mono-tag">
                    {t("overview.readiness.overline", { weekday: longWeekdayOf(next.starts_at, locale) })}
                  </p>
                  <h2 className="type-card-title">{t("overview.readiness.title")}</h2>
                  <p className="type-ui-caption">{t("overview.readiness.body", readiness)}</p>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </main>
    </>
  );
}
