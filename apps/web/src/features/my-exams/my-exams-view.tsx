"use client";

import type { Locale } from "@uki/contracts";
import { Banner, Button, RowExam, StatTile, Table } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { dayOf, isSameAlmatyDay, timeOf, weekdayOf } from "../../lib/format.ts";
import { examChecks } from "../overview/overview-model.ts";
import { AppLink } from "../shell/app-link.tsx";
import { PageHeader } from "../shell/page-header.tsx";
import { type ConfirmSeatsAction, ConfirmSeatsDialog } from "./confirm-seats-dialog.tsx";
import {
  applyConfirmation,
  assignmentState,
  bannerExam,
  canConfirm,
  listedExams,
  type MyExam,
  myExamStats,
  nextLabel,
  STATE_CHIP,
  seatRange,
} from "./my-exams-model.ts";

export type MyExamsViewProps = {
  exams: readonly MyExam[];
  /** The server's clock when the page rendered, so "Today" matches on both sides. */
  nowMs: number;
  confirmAction: ConfirmSeatsAction;
};

/**
 * 0.9 My exams (Figma 164:13518): the banner for the soonest assignment to confirm, four stat cards and
 * the Assignments table. Confirm seats on a row (and Review on the banner) opens 0.9a (164:15836). Each
 * row leads to the exam's lobby, or to its live wall once it has started.
 */
export function MyExamsView({ exams, nowMs, confirmAction }: MyExamsViewProps) {
  const t = useTranslations("dashboard");
  const locale = useDashboardLocale();
  const [rows, setRows] = useState<MyExam[]>(() => [...exams]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const listed = listedExams(rows);
  const banner = bannerExam(rows);
  const stats = myExamStats(rows, nowMs);
  const open = rows.find((row) => row.exam_id === confirming) ?? null;

  const languagesOf = (languages: readonly Locale[]) =>
    languages.map((language) => t(`myExams.language.${language}`)).join(", ");
  const seatsOf = (row: MyExam) => {
    const range = seatRange(row);
    return range ? t("myExams.seats", { from: range.from, to: range.to }) : t("myExams.allSeats");
  };
  const whenOf = (startsAt: string) =>
    isSameAlmatyDay(startsAt, nowMs)
      ? t("common.todayTime", { time: timeOf(startsAt) })
      : t("common.dateTime", { date: dayOf(startsAt, locale), time: timeOf(startsAt) });
  const nextValue = (startsAt: string) => {
    const label = nextLabel(startsAt, nowMs);
    switch (label.kind) {
      case "today":
        return t("myExams.stat.next.today", { time: timeOf(label.atMs) });
      case "weekday":
        return t("myExams.stat.next.day", {
          weekday: weekdayOf(label.atMs, locale),
          time: timeOf(label.atMs),
        });
      case "date":
        return dayOf(label.atMs, locale);
    }
  };
  const bannerBody = (row: MyExam) => {
    const name = row.exam.creator?.full_name ?? t("myExams.examOffice");
    const date = dayOf(row.exam.starts_at, locale);
    const range = seatRange(row);
    return range
      ? t("myExams.banner.body", { name, from: range.from, to: range.to, date })
      : t("myExams.banner.bodyAll", { name, date });
  };
  const firstToConfirm = stats.toConfirm.first;

  return (
    <>
      <PageHeader breadcrumb={t("shell.nav.overview")} title={t("myExams.title")} />
      <main className="flex flex-col gap-5 px-8 pt-6.5 pb-7">
        {banner ? (
          <Banner
            kind="warn"
            title={t("myExams.banner.title", { course: banner.exam.course })}
            body={bannerBody(banner)}
            action={
              <Button variant="secondary" onClick={() => setConfirming(banner.exam_id)}>
                {t("myExams.banner.review")}
              </Button>
            }
          />
        ) : null}

        <div className="grid grid-cols-4 gap-4">
          <StatTile
            label={t("myExams.stat.next.label")}
            value={
              // One line, as 0.9 draws it: "Сегодня 22:00" is a few pixels wider than the tile's text box.
              <span className="whitespace-nowrap">
                {stats.next ? nextValue(stats.next.exam.starts_at) : t("myExams.stat.next.none")}
              </span>
            }
            caption={stats.next?.exam.title}
          />
          <StatTile
            label={t("myExams.stat.assigned.label")}
            value={t("myExams.stat.assigned.value", { count: stats.assigned })}
            caption={t("myExams.stat.assigned.caption")}
          />
          <StatTile
            label={t("myExams.stat.students.label")}
            value={stats.students}
            caption={t("myExams.stat.students.caption")}
          />
          <StatTile
            label={t("myExams.stat.confirm.label")}
            value={stats.toConfirm.count}
            caption={
              firstToConfirm
                ? t("common.withDetail", {
                    main: firstToConfirm.exam.course,
                    detail: weekdayOf(firstToConfirm.exam.starts_at, locale),
                  })
                : t("myExams.stat.confirm.none")
            }
          />
        </div>

        <section
          aria-labelledby="assignments-title"
          className="overflow-clip rounded-card border border-line-default bg-surface"
        >
          <div className="px-5 pt-4.5 pb-3.5">
            <h2 id="assignments-title" className="type-card-title">
              {t("myExams.table.title")}
            </h2>
          </div>
          <Table>
            <tbody>
              {listed.map((row) => {
                const state = assignmentState(row);
                return (
                  <RowExam
                    key={row.exam_id}
                    data-exam-id={row.exam_id}
                    exam={row.exam.title}
                    examDetail={t("common.withDetail", {
                      main: seatsOf(row),
                      detail: languagesOf(row.languages),
                    })}
                    when={whenOf(row.exam.starts_at)}
                    duration={t("common.minutes", { minutes: row.exam.duration_min })}
                    students={row.students}
                    checks={examChecks(row.exam.checks)}
                    checkLabels={{
                      lock: t("overview.check.lock"),
                      gaze: t("overview.check.gaze"),
                      phone: t("overview.check.phone"),
                      id: t("overview.check.id"),
                    }}
                    status={STATE_CHIP[state]}
                    statusLabel={
                      state === "live"
                        ? t("overview.status.live")
                        : t(`myExams.status.${state === "toConfirm" ? "confirm" : state}`)
                    }
                    onStatusClick={canConfirm(row) ? () => setConfirming(row.exam_id) : undefined}
                    href={`/exams/${row.exam_id}/${state === "live" ? "live" : "lobby"}`}
                    linkAs={AppLink}
                  />
                );
              })}
              {listed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center opacity-58 type-body-s">
                    {t("myExams.table.empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </section>
      </main>
      <ConfirmSeatsDialog
        exam={open}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
        action={confirmAction}
        onSaved={(reply) => setRows((current) => applyConfirmation(current, reply))}
      />
    </>
  );
}
