"use client";

import {
  Button,
  ChartBars,
  ChartColumns,
  ChartLegendItem,
  ChartLine,
  ChartStack,
  type ChartTone,
  cn,
  StatTile,
} from "@uki/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { PageHeader } from "../shell/page-header.tsx";
import type { Faculty } from "../shell/scope.ts";
import { formatDayMonth } from "../students/student-format.ts";
import type { ReportsData } from "./reports-data.ts";
import {
  committeeShare,
  type DecisionPart,
  dayInstant,
  decisionSummary,
  flagShares,
  formatReviewTime,
  rateTile,
  reviewHeadline,
  reviewSeries,
  shareSize,
  type TermKey,
  termParts,
  termStartOf,
  weeklyHeadline,
  weeklySeries,
} from "./reports-model.ts";
import { FacultyPicker, TermPicker } from "./reports-pickers.tsx";
import "./reports-print.css";

export type ReportsViewProps = {
  data: ReportsData;
  /** The workspace's faculties and the one chosen in the workspace menu (0.1c), or null for all. */
  faculties: readonly Faculty[];
  facultyId: string | null;
  /** "KRU · Kostanay", on the printout. */
  workspaceName: string;
};

const DECISION_TONE: Readonly<Record<DecisionPart["key"], ChartTone>> = {
  no_issue: "ok",
  talk: "warn",
  committee: "flag",
  pending: "neutral",
};

/** A.1's chart card (102:10674): the mono overline at 50 %, the Card/Title headline, then the chart. */
function ReportCard({
  overline,
  headline,
  className,
  children,
}: {
  overline: string;
  headline: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 overflow-hidden rounded-card border border-line-default bg-surface px-6 pt-5.5 pb-6 text-fg-primary",
        "break-inside-avoid print:gap-3 print:px-5 print:pt-4 print:pb-5",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="type-mono-tag opacity-50">{overline}</p>
        <h2 className="type-card-title">{headline}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * A.1 Reports (Figma 102:10454): the term in numbers for the exam office, from the term_* views under
 * row-level security. The term picker keeps its choice in the address and the faculty picker is the
 * workspace menu's (0.1c); "All exams", the top bar's search and the bell are not drawn
 * (docs/decisions.md, 1.10). Export PDF prints the page on A4 through reports-print.css.
 */
export function ReportsView({ data, faculties, facultyId, workspaceName }: ReportsViewProps) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const locale = useDashboardLocale();

  const termLabel = (term: TermKey) => t("reports.term", termParts(term));
  const dayLabel = (day: string) => formatDayMonth(dayInstant(day), locale);
  const rate = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  const percent = (share: number) => format.number(share / 100, { style: "percent" });
  const none = t("reports.none");

  const { kpis, term } = data;
  const breadcrumb = t("reports.breadcrumb", { term: termLabel(term) });
  const facultyName =
    faculties.find((faculty) => faculty.id === facultyId)?.name ?? t("shell.workspace.allFaculties");

  // The tiles.
  const weeks = weeklySeries(data.weekly);
  const rateKpi = rateTile(weeks, term);
  const committee = committeeShare(kpis.committee, kpis.sessions);
  const rateCaption = (() => {
    if (rateKpi.value === null) return undefined;
    const { caption } = rateKpi;
    if (caption.kind === "week") {
      return t("reports.kpi.rate.caption", {
        kind: "week",
        week: dayLabel(caption.week),
        from: "",
        month: "",
      });
    }
    return t("reports.kpi.rate.caption", {
      kind: caption.kind,
      from: rate(caption.from),
      month: caption.month,
      week: "",
    });
  })();

  // Flags per 100 sessions, weekly.
  const weekly = weeklyHeadline(weeks);
  const weeklyText =
    weekly.kind === "empty"
      ? t("reports.weekly.headline", { kind: "empty", first: "", last: "", weeks: 0, week: "" })
      : weekly.kind === "single"
        ? t("reports.weekly.headline", {
            kind: "single",
            last: rate(weekly.last),
            week: dayLabel(weekly.week),
            first: "",
            weeks: 1,
          })
        : t("reports.weekly.headline", {
            kind: weekly.kind,
            first: rate(weekly.first),
            last: rate(weekly.last),
            weeks: weekly.weeks,
            week: "",
          });

  // What gets flagged.
  const types = flagShares(data.types);
  const topType = types[0];
  const typesText = topType
    ? t("reports.types.headline", { type: topType.group, size: shareSize(topType.share) })
    : t("reports.types.empty");

  // Decisions.
  const decisions = decisionSummary(data.decisions, kpis.flagged_sessions);
  const legend = decisions.parts.filter((part) => part.key !== "pending" || part.count > 0);

  // Median review time.
  const reviews = reviewSeries(data.reviewTimes);
  const review = reviewHeadline(reviews);
  const reviewText =
    review.kind === "empty"
      ? t("reports.review.headline", { kind: "empty", first: "", last: "" })
      : review.kind === "same"
        ? t("reports.review.headline", { kind: "same", first: "", last: formatReviewTime(review.last) })
        : t("reports.review.headline", {
            kind: review.kind,
            first: formatReviewTime(review.first),
            last: formatReviewTime(review.last),
          });

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={t("reports.title")} />
      <main
        data-print-root
        className="flex flex-col gap-5 px-8 pt-7 pb-8 text-fg-primary print:gap-3 print:p-0"
      >
        <div className="hidden flex-col gap-0.5 print:flex">
          <p className="type-ui-caption">
            {t("common.withDetail", { main: workspaceName, detail: facultyName })}
          </p>
          <p className="type-ui-title">{breadcrumb}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <TermPicker terms={data.terms} term={term} labelOf={termLabel} />
          <FacultyPicker faculties={faculties} facultyId={facultyId} />
          <span className="min-w-0 flex-1" />
          <Button variant="secondary" onClick={() => window.print()}>
            {t("reports.export")}
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-4 print:gap-3">
          <StatTile
            data-kpi="exams"
            className="print:p-4"
            label={t("reports.kpi.exams.label")}
            value={format.number(kpis.exams_run)}
            caption={t("reports.kpi.exams.caption", { date: dayLabel(termStartOf(term)) })}
          />
          <StatTile
            data-kpi="sessions"
            className="print:p-4"
            label={t("reports.kpi.sessions.label")}
            value={format.number(kpis.sessions)}
            caption={t("reports.kpi.sessions.caption")}
          />
          <StatTile
            data-kpi="rate"
            className="print:p-4"
            label={t("reports.kpi.rate.label")}
            value={rateKpi.value === null ? none : rate(rateKpi.value)}
            caption={rateCaption}
          />
          <StatTile
            data-kpi="committee"
            className="print:p-4"
            label={t("reports.kpi.committee.label")}
            value={
              committee === null
                ? none
                : format.number(committee, { style: "percent", maximumFractionDigits: 1 })
            }
            caption={t("reports.kpi.committee.caption", { count: kpis.committee, total: kpis.sessions })}
          />
        </div>

        <div className="grid grid-cols-[41fr_28fr] gap-x-4 gap-y-5 print:grid-cols-2 print:gap-3">
          <ReportCard
            overline={t("reports.weekly.overline")}
            headline={weeklyText}
            className="print:col-span-2"
          >
            <ChartColumns
              data-chart="weekly"
              label={weeklyText}
              formatTick={(value) => format.number(value)}
              columns={weeks.map((week) => ({
                key: week.week,
                label: dayLabel(week.week),
                value: week.rate,
                valueLabel: week.rate === null ? "" : rate(week.rate),
                tooltip:
                  week.rate === null
                    ? undefined
                    : { date: dayLabel(week.week), value: t("reports.weekly.tooltip", { rate: week.rate }) },
              }))}
            />
          </ReportCard>

          <ReportCard overline={t("reports.types.overline")} headline={typesText}>
            <ChartBars
              data-chart="types"
              variant="quiet"
              items={types.map((type) => ({
                key: type.group,
                label: t(`reports.types.${type.group}`),
                value: type.flags,
                valueLabel: percent(type.share),
              }))}
            />
          </ReportCard>

          <ReportCard
            overline={t("reports.decisions.overline", { count: decisions.flagged })}
            headline={t("reports.decisions.headline", { decision: decisions.top ?? "none" })}
            className="print:order-4 print:col-span-2"
          >
            <ChartStack
              data-chart="decisions"
              segments={decisions.parts.map((part) => ({
                key: part.key,
                tone: DECISION_TONE[part.key],
                value: part.count,
              }))}
            />
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {legend.map((part) => (
                <ChartLegendItem
                  key={part.key}
                  layout="stacked"
                  tone={DECISION_TONE[part.key]}
                  label={t(`reports.decisions.${part.key}`)}
                  value={t("common.withDetail", {
                    main: format.number(part.count),
                    detail: percent(part.share),
                  })}
                />
              ))}
            </div>
            <p className="type-ui-caption opacity-60">{t("reports.decisions.note")}</p>
          </ReportCard>

          <ReportCard overline={t("reports.review.overline")} headline={reviewText} className="print:order-3">
            <ChartLine
              data-chart="review"
              variant="spark"
              label={reviewText}
              points={reviews.map((point) => ({
                key: point.week,
                label: dayLabel(point.week),
                value: point.seconds,
                valueLabel: formatReviewTime(point.seconds),
                tooltip: {
                  date: dayLabel(point.week),
                  value: t("reports.review.tooltip", { time: formatReviewTime(point.seconds) }),
                },
              }))}
            />
          </ReportCard>
        </div>
      </main>
    </>
  );
}
