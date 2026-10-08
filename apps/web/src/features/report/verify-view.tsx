"use client";

import { normalizeVerifyCode, type VerifyReportOutput } from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import { Logo } from "@uki/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { dashboardLocaleOf } from "../../i18n/locale.ts";
import { longDate, reportDay } from "./report-document.tsx";
import { printedVerifyCode } from "./report-model.ts";
import { ShareBanner } from "./shared-report-view.tsx";

function VerifyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-start justify-between gap-4 border-line-default border-b py-2">
      <dt className="shrink-0 opacity-60 type-ui-label">{label}</dt>
      <dd className="min-w-0 break-all text-right type-ui-mono">{children}</dd>
    </div>
  );
}

/** A public page's card: the wordmark, a title and what follows (verify, not found). */
export function PublicCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section
      aria-labelledby="public-card-title"
      className="flex w-full max-w-105 flex-col items-start gap-3.5 rounded-card border border-line-default bg-surface p-5"
    >
      <Logo variant="wordmark-ink" className="h-6.5 w-auto" />
      <h1 id="public-card-title" className="type-h3">
        {title}
      </h1>
      {children}
    </section>
  );
}

export type VerifyViewProps = { code: string; result: VerifyReportOutput };

/**
 * /verify/[code]: verify_report's answer in 3.5's banner (the two result lines are new keys, a frame
 * gap logged in docs/decisions.md), and 3.5's Report ID row with the exam, date, initials and issue
 * time when the report is unchanged. A changed or unknown report shows only the code that was asked.
 */
export function VerifyView({ code, result }: VerifyViewProps) {
  const t = useTranslations("dashboard.report");
  const locale = dashboardLocaleOf(useLocale());
  const intact = result.found && result.intact;
  const normalized = result.found ? result.code : normalizeVerifyCode(code);
  const shown = normalized === null ? code : printedVerifyCode(normalized);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary">
      <ShareBanner>
        <span role="status" data-result={intact ? "intact" : "not-verified"}>
          {t("verify.result", { result: intact ? "intact" : "other" })}
        </span>
      </ShareBanner>
      <main className="flex w-full justify-center px-4 pt-7 pb-10">
        <PublicCard title={t("title")}>
          <dl className="flex w-full flex-col gap-3.5">
            <VerifyRow label={t("shared.copy.reportId")}>{shown}</VerifyRow>
            {result.found && result.intact ? (
              <>
                <VerifyRow label={t("verify.row.exam")}>{result.exam_title}</VerifyRow>
                <VerifyRow label={t("verify.row.date")}>{reportDay(result.exam_starts_at, locale)}</VerifyRow>
                <VerifyRow label={t("doc.row.student")}>{result.initials}</VerifyRow>
                <VerifyRow label={t("shared.copy.issued")}>
                  {t("shared.copy.issuedValue", {
                    date: longDate(result.issued_at, locale),
                    time: formatTime(result.issued_at, "en"),
                  })}
                </VerifyRow>
              </>
            ) : null}
          </dl>
        </PublicCard>
      </main>
    </div>
  );
}

/** The page every refused share link gets: unknown, revoked and expired read the same. */
export function ShareNotFoundView() {
  const t = useTranslations("dashboard.report");
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 pt-16 text-fg-primary">
      <PublicCard title={t("notFound.title")}>
        <p className="opacity-60 type-card-caption">{t("notFound.body")}</p>
      </PublicCard>
    </div>
  );
}
