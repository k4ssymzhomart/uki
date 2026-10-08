"use client";

import {
  type CompactEvent,
  EventSource,
  EventType,
  type ReportFlag,
  type ReportPayload,
} from "@uki/contracts";
import { formatDate, formatTime } from "@uki/i18n";
import { cn, Logo } from "@uki/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { type DashboardLocale, dashboardLocaleOf } from "../../i18n/locale.ts";
import { useEventCopy } from "../review/use-review-copy.ts";
import { identityOf, orderedFlags, printedVerifyCode, shortName, timeUsed } from "./report-model.ts";

/** "Fri 9 Oct 2026", "пт, 9 окт 2026": 3.4's subtitle date, in Asia/Almaty. */
export function reportDay(value: string, locale: DashboardLocale): string {
  return `${formatDate(value, locale)} ${formatDate(value, locale, { year: "numeric" })}`;
}

/** "16 Oct 2026": the share banner's and This copy's dates, in Asia/Almaty. */
export function longDate(value: string, locale: DashboardLocale): string {
  return formatDate(value, locale, { day: "numeric", month: "short", year: "numeric" });
}

/** The report's flag as a stored event, for the wall's wording (titles and details). */
function asEvent(flag: ReportFlag, report: ReportPayload): CompactEvent | null {
  const type = EventType.safeParse(flag.type);
  const source = EventSource.safeParse(flag.source);
  if (!type.success || !source.success) return null;
  return {
    id: flag.id,
    session_id: report.session.id,
    exam_id: report.exam.id,
    type: type.data,
    source: source.data,
    review: "flag",
    at: flag.at,
    received_at: flag.received_at,
    data: flag.data,
    frame_count: flag.frame_count,
  };
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="flex w-full flex-col gap-1 type-mono-s">{children}</dl>;
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex w-full items-start">
      <dt className="w-28 shrink-0 opacity-55 sm:w-37.5">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

function Divider() {
  return <hr className="h-px w-full shrink-0 border-0 bg-line-default" />;
}

export type ReportDocumentProps = {
  report: ReportPayload;
  /** The first still of each flag by flag id: signed 5-minute URLs. */
  stills: Readonly<Record<string, string>>;
  /** 3.5 makes the report's title the page's heading; 3.4 has its own in the top bar. */
  headingLevel?: "h1" | "h2";
  className?: string;
};

/**
 * The report page (Figma "Report page" 69:5213 on 3.4, 162:13579 on 3.5): the verify code, the session,
 * every flag with its first still, the proctors' notes, the decision and the footnote. It is what Download
 * PDF prints (`data-print-root`, report-print.css), with the stills at a fixed 72 x 48.
 */
export function ReportDocument({ report, stills, headingLevel = "h2", className }: ReportDocumentProps) {
  const t = useTranslations("dashboard.report");
  const locale = dashboardLocaleOf(useLocale());
  const { describe, text } = useEventCopy();
  const Heading = headingLevel;
  const Subheading = headingLevel === "h1" ? "h2" : "h3";
  const code = report.report === null ? null : printedVerifyCode(report.report.verify_code);
  const used = timeUsed(report);
  const identity = identityOf(report.session);
  const flags = orderedFlags(report.flags);
  const date = reportDay(report.exam.starts_at, locale);
  const subtitle =
    report.student.group_code === null
      ? t("doc.subtitleNoGroup", { exam: report.exam.title, date })
      : t("doc.subtitle", { exam: report.exam.title, date, group: report.student.group_code });
  const decision = report.decision;

  const flagDetail = (flag: ReportFlag, event: CompactEvent | null): string | undefined => {
    const score = flag.data.score;
    const held = flag.data.held_ms;
    if (flag.type === "phone.detected" && typeof score === "number" && typeof held === "number") {
      return t("doc.phoneDetail", { score, seconds: held / 1000 });
    }
    const detail = event === null ? undefined : describe(event).detail;
    return detail === undefined ? undefined : text(detail);
  };

  return (
    <article
      data-print-root
      aria-labelledby="report-document-title"
      className={cn(
        "flex w-150 max-w-full flex-col items-start gap-2.5 rounded-sm bg-surface px-5 py-6.5 text-fg-primary shadow-float sm:px-8.5",
        "print:max-w-none print:rounded-none print:px-0 print:py-0 print:shadow-none",
        className,
      )}
    >
      <div className="flex w-full items-center">
        <Logo variant="wordmark-ink" className="h-6.5 w-auto" />
        <span className="flex-1" />
        {code === null ? null : (
          <p className="type-mono-s opacity-55" data-testid="report-verify-code">
            {code}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <Heading id="report-document-title" className="type-h3">
          {t("title")}
        </Heading>
        <p className="type-card-caption opacity-60">{subtitle}</p>
      </div>

      <Rows>
        <Row label={t("doc.row.student")}>
          {t("doc.student", { name: report.student.full_name, number: report.student.student_number })}
        </Row>
        <Row label={t("doc.row.identity")}>
          {t("doc.identity", {
            result:
              identity.kind === "unchecked"
                ? "unchecked"
                : identity.at === null
                  ? "matchedNoTime"
                  : "matched",
            time:
              identity.kind === "matched" && identity.at !== null
                ? formatTime(identity.at, "en", { seconds: true })
                : "",
          })}
        </Row>
        <Row label={t("doc.row.timeUsed")}>{t("doc.timeUsed", used)}</Row>
        <Row label={t("doc.row.proctor")}>{report.proctor_name ?? t("doc.noProctor")}</Row>
      </Rows>

      <Divider />

      <Subheading className="type-card-title">{t("doc.flags", { count: flags.length })}</Subheading>
      {flags.length === 0 ? (
        <p className="type-card-caption opacity-60">{t("doc.noFlags")}</p>
      ) : (
        <ul className="flex w-full flex-col gap-2.5">
          {flags.map((flag) => {
            const event = asEvent(flag, report);
            const time = formatTime(flag.at, "en", { seconds: true });
            const title = event === null ? "" : text(describe(event).title);
            const detail = flagDetail(flag, event);
            const still = stills[flag.id];
            return (
              <li key={flag.id} className="flex w-full items-center gap-3.5" data-flag-type={flag.type}>
                <div className="h-12 w-18 shrink-0 overflow-hidden rounded-sm bg-subtle">
                  {still === undefined ? null : (
                    // biome-ignore lint/performance/noImgElement: signed 5-minute URLs must not pass through the Next.js image cache
                    <img
                      src={still}
                      alt={t("doc.still", { time })}
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                  <p className="whitespace-pre-wrap type-label-m">
                    {t("doc.flagTitle", { time, flag: title })}
                  </p>
                  {detail === undefined ? null : <p className="type-card-caption opacity-60">{detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {report.notes.length === 0 ? null : (
        <>
          <Subheading className="type-card-title">
            {t("doc.notes", { count: report.notes.length })}
          </Subheading>
          <ul className="flex w-full flex-col gap-2.5">
            {report.notes.map((note) => (
              <li key={note.id} className="flex w-full flex-col gap-px">
                <p className="whitespace-pre-wrap type-label-m">
                  {t("doc.flagTitle", {
                    time: formatTime(note.at, "en", { seconds: true }),
                    flag: t("doc.row.note"),
                  })}
                </p>
                <p className="type-card-caption opacity-60">
                  {t("doc.noteDetail", { text: note.text ?? "", name: note.by_name ?? "none" })}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <Divider />

      <Rows>
        <Row label={t("doc.row.decision")}>
          {t("doc.decision", { decision: decision?.decision ?? "none" })}
        </Row>
        {decision?.note ? <Row label={t("doc.row.note")}>{decision.note}</Row> : null}
        {decision === null ? null : (
          <Row label={t("doc.row.reviewed")}>
            {t("doc.reviewed", {
              name: shortName(decision.reviewer_name),
              time: formatTime(decision.decided_at, "en"),
            })}
          </Row>
        )}
      </Rows>

      <p className="type-card-caption opacity-55">{t("doc.footer")}</p>
    </article>
  );
}
