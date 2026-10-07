"use client";

import { Icon, RowExam, rowExamColumns, StatTile, Tab, TabGroup, Table, TableHeaderCell } from "@uki/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import reportArt from "../../assets/uki-3d-report.png";
import stopwatchArt from "../../assets/uki-3d-stopwatch.png";
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
};

/** Where an exam's row leads in Phase 0: its lobby before the start, its live wall after. */
function examHref(row: OverviewRow): string | undefined {
  const phase = examPhase(row.status);
  if (phase === "cancelled") return undefined;
  return `/exams/${row.id}/${phase === "upcoming" ? "lobby" : "live"}`;
}

/**
 * 0.1 Overview (Figma 51:2046): stat cards, the exams table with client-side filters, and the next
 * exam's card with Open lobby. Import CSV and New exam are hidden until Phase 1.
 */
export function OverviewView({ rows, groupCount, readiness, nowMs }: OverviewViewProps) {
  const t = useTranslations("dashboard");
  const staff = useStaff();
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
      : t("common.dateTime", { date: dayOf(row.starts_at), time: timeOf(row.starts_at) });
  const oneLine = (text: string | undefined) =>
    text === undefined ? undefined : <span className="block truncate">{text}</span>;
  const titles = (list: readonly OverviewRow[]) =>
    list.length > 0 ? list.map((row) => row.title).join(" · ") : undefined;
  const breadcrumb = staff.facultyName
    ? t("common.withDetail", { main: workspaceShortName(staff.workspaceName), detail: staff.facultyName })
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
                    weekday: weekdayOf(next.starts_at),
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
          <StatTile
            className="items-stretch"
            label={
              <span className="inline-flex items-center gap-1.5">
                {t("overview.stat.video.label")}
                <Icon name="info" className="size-3.5" />
              </span>
            }
            value={t("overview.stat.video.value", { megabytes: 0 })}
            caption={t("overview.stat.video.caption")}
          />
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
                    status={chip.status}
                    statusLabel={t(`overview.status.${chip.key}`, { count: chip.count ?? 0 })}
                    href={examHref(row)}
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
                  {t("overview.next.overline", { date: dayOf(next.starts_at) })}
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
                    {t("overview.readiness.overline", { weekday: longWeekdayOf(next.starts_at) })}
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
