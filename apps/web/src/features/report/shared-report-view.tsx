"use client";

import type { SharedReportResponse } from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import { Button, Icon } from "@uki/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { dashboardLocaleOf } from "../../i18n/locale.ts";
import { longDate, ReportDocument } from "./report-document.tsx";
import { framesLine, printedVerifyCode, sharedStills } from "./report-model.ts";
import "./report-print.css";

function CopyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-start justify-between gap-4 border-line-default border-b py-2">
      <dt className="shrink-0 opacity-60 type-ui-label">{label}</dt>
      <dd className="min-w-0 text-right type-ui-mono">{children}</dd>
    </div>
  );
}

/** 3.5's lime banner (Figma "Share banner" 162:13570); /verify/[code] shows its result in the same place. */
export function ShareBanner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 bg-brand-subtle px-4 py-3 sm:min-h-14 sm:flex-nowrap sm:px-10 sm:py-0 print:hidden">
      <Icon name="eyes" className="size-4.5" />
      <p className="min-w-0 flex-1 type-ui-label">{children}</p>
      {action}
    </header>
  );
}

export type SharedReportViewProps = { report: SharedReportResponse };

/**
 * 3.5 Committee · Shared report (Figma 162:13464): the read-only banner with who shared it and until
 * when, the report page with its stills, and This copy. Rendered on the server from the shared-report
 * function's reply; the only thing the browser adds is Download PDF.
 */
export function SharedReportView({ report }: SharedReportViewProps) {
  const t = useTranslations("dashboard.report");
  const locale = dashboardLocaleOf(useLocale());
  const share = report.share;
  const kept = report.data_kept;
  const frames = framesLine(kept);
  const issuedAt = report.report?.issued_at ?? report.generated_at;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary print:bg-surface">
      <ShareBanner
        action={
          <Button variant="primary" onClick={() => window.print()}>
            {t("export.pdf")}
          </Button>
        }
      >
        {t("shared.banner", {
          name: share.shared_by ?? "none",
          workspace: share.workspace_name,
          date: longDate(share.expires_at, locale),
          time: formatTime(share.expires_at, "en"),
        })}
      </ShareBanner>

      <main className="flex w-full flex-col items-center gap-4 px-4 pt-4 pb-10 lg:flex-row lg:items-start lg:justify-center lg:gap-6 lg:px-10 lg:pt-7 print:block print:p-0">
        <ReportDocument
          report={report}
          stills={sharedStills(report)}
          headingLevel="h1"
          className="w-full lg:w-150"
        />

        <section
          aria-labelledby="shared-copy-title"
          className="flex w-full flex-col items-start gap-3.5 rounded-card border border-line-default bg-surface p-5 lg:w-105 print:hidden"
        >
          <h2 id="shared-copy-title" className="type-card-title">
            {t("shared.copy.title")}
          </h2>
          <dl className="flex w-full flex-col gap-3.5">
            <CopyRow label={t("shared.copy.issued")}>
              {t("shared.copy.issuedValue", {
                date: longDate(issuedAt, locale),
                time: formatTime(issuedAt, "en"),
              })}
            </CopyRow>
            {report.report === null ? null : (
              <CopyRow label={t("shared.copy.reportId")}>
                {printedVerifyCode(report.report.verify_code)}
              </CopyRow>
            )}
            <CopyRow label={t("kept.video")}>{t("kept.megabytes", { mb: kept.video_bytes })}</CopyRow>
            <CopyRow label={t("kept.frames")}>{t("shared.copy.frames", frames)}</CopyRow>
            <CopyRow label={t("kept.events")}>
              {t("shared.copy.events", { count: kept.session_events })}
            </CopyRow>
            <CopyRow label={t("shared.copy.keptUntil")}>
              {t("shared.copy.keptUntilValue", { date: longDate(kept.frames_kept_until, locale) })}
            </CopyRow>
          </dl>
          {report.decision === null ? null : (
            <p className="w-full rounded-md bg-ok-subtle px-3.5 py-3 type-card-caption">
              {t("shared.decisionNote", { decision: report.decision.decision })}
            </p>
          )}
          <p className="opacity-60 type-card-caption">
            {t("shared.audit", { workspace: share.workspace_name })}
          </p>
        </section>
      </main>
    </div>
  );
}
