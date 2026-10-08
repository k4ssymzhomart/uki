"use client";

import {
  Avatar,
  Chip,
  Count,
  IconButton,
  initials,
  SearchField,
  StatTile,
  Tab,
  TabGroup,
  Table,
  TableHeaderCell,
} from "@uki/ui";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { PageHeader } from "../shell/page-header.tsx";
import { FilterMenu } from "./filter-menu.tsx";
import { studentColumns } from "./student-columns.ts";
import { formatDayMonth } from "./student-format.ts";
import {
  filterStudents,
  flagTone,
  pageOf,
  REVIEW_STATUS_CHIP,
  type StudentFilters,
  type StudentRow,
  type StudentTab,
  sortStudents,
  studentFacets,
  studentStats,
  studentStatus,
} from "./students-model.ts";
import { filtersToSearch } from "./students-search.ts";

export type StudentsViewProps = {
  rows: readonly StudentRow[];
  /** Ids of the students with a flag in an exam of this term. */
  flaggedThisTerm: readonly string[];
  /** The breadcrumb's second part: the faculty chosen in the workspace menu (0.1c), or All faculties. */
  scopeName: string;
  /** The filters from the address (?q=, ?group=, ?programme=, ?year=, ?tab=). */
  initialFilters: StudentFilters;
};

/**
 * A.2 Students (Figma 104:10579): the students of the workspace from `student_overview`, searched by
 * name or student number and filtered by group, programme and year (plan, Screens), with the Flagged tab
 * for this term's flagged students. Search and filters run in the browser and are kept in the address,
 * so Back from a profile returns to the same list. READY and NEED SETUP, the Group 204 tab and Import CSV
 * are not drawn (docs/decisions.md, 1.11).
 */
export function StudentsView({ rows, flaggedThisTerm, scopeName, initialFilters }: StudentsViewProps) {
  const t = useTranslations("dashboard.students");
  const format = useFormatter();
  const locale = useDashboardLocale();
  const [filters, setFilters] = useState<StudentFilters>(initialFilters);
  const [page, setPage] = useState(0);
  const flagged = useMemo(() => new Set(flaggedThisTerm), [flaggedThisTerm]);
  const sorted = useMemo(() => sortStudents(rows, locale), [rows, locale]);
  const facets = useMemo(() => studentFacets(rows, locale), [rows, locale]);
  const stats = studentStats(rows, flagged);
  const visible = filterStudents(sorted, filters, flagged);
  const shown = pageOf(visible, page);

  useEffect(() => {
    const search = filtersToSearch(filters);
    const url = `${window.location.pathname}${search}`;
    if (url !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(null, "", url);
  }, [filters]);

  const update = (next: Partial<StudentFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(0);
  };

  const groupLabel = (code: string) => t("row.group", { code });
  const yearLabel = (year: number) => t("filter.year.value", { year });
  const detailOf = (row: StudentRow): string | null => {
    if (row.programme && row.year !== null)
      return t("row.programmeYear", { programme: row.programme, year: row.year });
    if (row.programme) return row.programme;
    return row.year === null ? null : yearLabel(row.year);
  };

  return (
    <>
      <PageHeader breadcrumb={t("breadcrumb", { scope: scopeName })} title={t("title")} />
      <main className="flex flex-col gap-5 px-8 pt-7 pb-8">
        <div className="grid grid-cols-2 gap-4">
          <StatTile
            className="items-stretch"
            label={t("stat.students.label")}
            value={format.number(stats.students)}
            caption={t("stat.students.caption", { count: stats.faculties })}
          />
          <StatTile
            className="items-stretch"
            label={t("stat.flagged.label")}
            value={format.number(stats.flagged)}
            caption={t("stat.flagged.caption", {
              share: format.number(stats.flaggedShare, { style: "percent", maximumFractionDigits: 1 }),
            })}
          />
        </div>

        <section
          aria-labelledby="students-title"
          className="overflow-clip rounded-card border border-line-default bg-surface"
        >
          <div className="flex min-h-19 items-center gap-3 py-4 pr-4 pl-5">
            <h2 id="students-title" className="type-card-title">
              {t("table.title")}
            </h2>
            <TabGroup
              value={filters.tab}
              onValueChange={(value) => update({ tab: value as StudentTab })}
              aria-label={t("tab.label")}
              variant="plain"
            >
              <Tab value="all">{t("tab.all", { count: format.number(stats.students) })}</Tab>
              <Tab value="flagged">{t("tab.flagged", { count: format.number(stats.flagged) })}</Tab>
            </TabGroup>
            <div className="min-w-0 flex-1" />
            <FilterMenu
              label={t("filter.group.label")}
              allLabel={t("filter.group.all")}
              valueLabel={(facet) => groupLabel(facet.label)}
              facets={facets.groups}
              value={filters.group}
              onChange={(group) => update({ group })}
            />
            <FilterMenu
              label={t("filter.programme.label")}
              allLabel={t("filter.programme.all")}
              valueLabel={(facet) => facet.label}
              facets={facets.programmes}
              value={filters.programme}
              onChange={(programme) => update({ programme })}
            />
            <FilterMenu
              label={t("filter.year.label")}
              allLabel={t("filter.year.all")}
              valueLabel={(facet) => yearLabel(facet.value)}
              facets={facets.years}
              value={filters.year}
              onChange={(year) => update({ year })}
            />
            <SearchField
              label={t("search.label")}
              placeholder={t("search.placeholder")}
              value={filters.query}
              onChange={(event) => update({ query: event.target.value })}
            />
          </div>
          <Table aria-labelledby="students-title">
            <thead>
              <tr className="bg-subtle">
                <TableHeaderCell
                  className={`${studentColumns.student} h-9 py-0`}
                  label={t("column.student")}
                />
                <TableHeaderCell
                  className={`${studentColumns.group} h-9 py-0 pl-0`}
                  label={t("column.group")}
                />
                <TableHeaderCell
                  className={`${studentColumns.exams} h-9 py-0 pl-0`}
                  label={t("column.exams")}
                />
                <TableHeaderCell
                  className={`${studentColumns.flags} h-9 py-0 pl-0`}
                  label={t("column.flags")}
                />
                <TableHeaderCell
                  className={`${studentColumns.lastExam} h-9 py-0 pl-0`}
                  label={t("column.lastExam")}
                />
                <TableHeaderCell
                  className={`${studentColumns.status} h-9 py-0 pl-0`}
                  label={t("column.status")}
                />
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((row) => {
                const status = studentStatus(row);
                const detail = detailOf(row);
                return (
                  <tr
                    key={row.id}
                    data-student-id={row.id}
                    className="relative border-b border-line-default bg-surface text-fg-primary hover:bg-canvas"
                  >
                    <td className={`${studentColumns.student} py-2.5 align-middle`}>
                      <div className="flex min-w-0 items-center gap-3 overflow-clip">
                        <Avatar tone="paper" size="md" initials={initials(row.full_name, locale)} />
                        <div className="flex min-w-0 flex-col items-start gap-px overflow-clip whitespace-nowrap">
                          <Link
                            href={`/students/${row.id}`}
                            prefetch={false}
                            className="outline-none type-label-m after:absolute after:inset-0 focus-visible:after:shadow-focus"
                          >
                            {row.full_name}
                          </Link>
                          <p className="opacity-55 type-ui-mono">{row.student_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`${studentColumns.group} align-middle`}>
                      <div className="flex min-w-0 flex-col items-start gap-0.5 overflow-clip whitespace-nowrap">
                        <p className="type-ui-label">
                          {row.group_code === null ? t("row.noGroup") : groupLabel(row.group_code)}
                        </p>
                        {detail === null ? null : <p className="opacity-55 type-ui-caption">{detail}</p>}
                      </div>
                    </td>
                    <td className={`${studentColumns.exams} align-middle type-ui-mono`}>
                      {format.number(row.exams_taken)}
                    </td>
                    <td className={`${studentColumns.flags} align-middle`}>
                      <Count tone={flagTone(row.flags)}>{format.number(row.flags)}</Count>
                    </td>
                    <td className={`${studentColumns.lastExam} align-middle`}>
                      {row.last_exam_title === null ? null : (
                        <div className="flex min-w-0 flex-col items-start gap-0.5 overflow-clip whitespace-nowrap">
                          <p className="max-w-full truncate type-ui-label">{row.last_exam_title}</p>
                          {row.last_exam_at === null ? null : (
                            <p className="opacity-55 type-ui-caption">
                              {formatDayMonth(row.last_exam_at, locale)}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`${studentColumns.status} align-middle`}>
                      <Chip status={REVIEW_STATUS_CHIP[status]}>{t(`status.${status}`)}</Chip>
                    </td>
                  </tr>
                );
              })}
              {shown.rows.length === 0 ? (
                <tr className="bg-surface">
                  <td colSpan={6} className="px-5 py-8 text-center opacity-60 type-ui-caption">
                    {rows.length === 0 ? t("empty.none") : t("empty.filtered")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
          <div className="flex items-center gap-2 bg-subtle py-2.5 pr-4 pl-5">
            <p className="min-w-0 flex-1 opacity-60 type-ui-caption" aria-live="polite">
              {t("footer.range", {
                from: format.number(shown.from),
                to: format.number(shown.to),
                total: format.number(shown.total),
              })}
            </p>
            <IconButton
              icon="chevron-left"
              label={t("footer.previous")}
              disabled={shown.page === 0}
              onClick={() => setPage(shown.page - 1)}
            />
            <IconButton
              icon="chevron-right"
              label={t("footer.next")}
              disabled={shown.page >= shown.pageCount - 1}
              onClick={() => setPage(shown.page + 1)}
            />
          </div>
        </section>
      </main>
    </>
  );
}
