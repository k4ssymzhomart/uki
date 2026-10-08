"use client";

import { SHARE_TTL_DAYS } from "@uki/contracts";
import { Button, Field, fieldBoxVariants, Icon, useToast } from "@uki/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import shieldArt from "../../assets/uki-3d-laptop-shield.png";
import { PageHeader } from "../shell/page-header.tsx";
import { useFunctionsClient } from "../wall/use-command.ts";
import { useStills } from "../wall/use-stills.ts";
import { createShareLink } from "./report-actions.ts";
import type { ReportData } from "./report-data.ts";
import { ReportDocument } from "./report-document.tsx";
import { csvFileName, eventsCsv, shareUrl } from "./report-model.ts";
import "./report-print.css";

/** Loads one flag's stills through the `stills` function (one audit row per still) and reports the first. */
function FlagStill({
  flagId,
  frameCount,
  onStill,
}: {
  flagId: string;
  frameCount: number;
  onStill: (flagId: string, url: string | undefined) => void;
}) {
  const getClient = useFunctionsClient();
  const state = useStills({ eventId: flagId, frameCount, confirmed: 0, getClient });
  const url = state.stills[0]?.url;
  useEffect(() => {
    onStill(flagId, url);
  }, [flagId, url, onStill]);
  return null;
}

/** Export CSV: the session's events as a file, built in the browser from what the page already read. */
function downloadCsv(csv: string, name: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Share with the committee (Figma Input 69:5278): makes the link on the first click and shows it once. */
function ShareField({ reportId }: { reportId: string | null }) {
  const t = useTranslations("dashboard.report");
  const toast = useToast();
  const id = useId();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ kind: "success", message: t("share.copied") });
    } catch {
      // The link stays selectable in the field when the clipboard is not available.
    }
  };

  const create = async () => {
    if (reportId === null || busy) return;
    setBusy(true);
    setFailed(false);
    const result = await createShareLink({ report_id: reportId });
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    const url = shareUrl(window.location.origin, result.path);
    setLink(url);
    await copy(url);
  };

  return (
    <Field
      controlId={`${id}-share`}
      messageId={`${id}-share-message`}
      label={t("share.label")}
      helper={link === null ? undefined : t("share.once")}
      error={failed ? t("share.failed") : undefined}
      state={failed ? "error" : "default"}
      className="w-full"
    >
      <div className={fieldBoxVariants({ state: failed ? "error" : "default" })}>
        {link === null ? (
          <button
            id={`${id}-share`}
            type="button"
            disabled={reportId === null}
            aria-busy={busy || undefined}
            onClick={() => void create()}
            className="min-w-0 flex-1 cursor-pointer truncate text-left type-body-s outline-none disabled:cursor-not-allowed"
          >
            {t("share.field", { days: SHARE_TTL_DAYS })}
          </button>
        ) : (
          <input
            id={`${id}-share`}
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            aria-describedby={`${id}-share-message`}
            className="min-w-0 flex-1 truncate bg-transparent type-body-s outline-none"
            data-testid="share-link"
          />
        )}
        <button
          type="button"
          aria-label={t("share.copy")}
          disabled={reportId === null || busy}
          onClick={() => void (link === null ? create() : copy(link))}
          className="flex shrink-0 cursor-pointer rounded-pill outline-none focus-visible:shadow-focus disabled:cursor-not-allowed"
        >
          <Icon name="copy" className="size-5" />
        </button>
      </div>
    </Field>
  );
}

function KeptRow({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex w-full items-start type-mono-s">
      <dt className="w-37.5 shrink-0 opacity-55">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

export type ReportViewProps = ReportData;

/**
 * 3.4 Integrity report (Figma 51:2096): the report page on its grey preview, Export (Download PDF prints
 * the page through report-print.css, Export CSV builds the events file here, Share with the committee
 * calls create_share and shows the link once) and the exam's Data kept.
 */
export function ReportView({ report, events }: ReportViewProps) {
  const t = useTranslations("dashboard.report");
  const [stills, setStills] = useState<Record<string, string>>({});
  const [onStill] = useState(
    () => (flagId: string, url: string | undefined) =>
      setStills((current) => {
        if (current[flagId] === url) return current;
        const next = { ...current };
        if (url === undefined) delete next[flagId];
        else next[flagId] = url;
        return next;
      }),
  );
  const kept = report.data_kept;
  const code = report.report?.verify_code ?? null;

  return (
    <>
      <PageHeader
        breadcrumb={t("breadcrumb", { exam: report.exam.title, student: report.student.full_name })}
        title={t("title")}
      />
      <main className="flex flex-1 items-stretch gap-6 px-8 pt-6 pb-7 print:block print:p-0">
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto rounded-card bg-subtle p-8 print:block print:overflow-visible print:rounded-none print:bg-transparent print:p-0">
          <ReportDocument report={report} stills={stills} />
        </div>

        <div className="flex w-95 shrink-0 flex-col gap-4 print:hidden">
          <section
            aria-labelledby="report-export-title"
            className="flex w-full flex-col items-start gap-2.5 rounded-card border border-line-default bg-surface px-5 pt-4.5 pb-5"
          >
            <h2 id="report-export-title" className="type-card-title">
              {t("export.title")}
            </h2>
            <Button variant="primary" className="w-full" onClick={() => window.print()}>
              {t("export.pdf")}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => downloadCsv(eventsCsv(events), csvFileName(code))}
            >
              {t("export.csv")}
            </Button>
            <ShareField reportId={report.report?.id ?? null} />
          </section>

          <section
            aria-labelledby="report-kept-title"
            className="flex w-full flex-col items-start gap-2 rounded-card bg-brand-subtle px-5 pt-4 pb-5"
          >
            <div className="flex items-center gap-3">
              <Image src={shieldArt} alt="" className="size-16 shrink-0 object-contain" />
              <div className="flex flex-col">
                <p className="uppercase opacity-60 type-mono-tag">{t("kept.eyebrow")}</p>
                <h2 id="report-kept-title" className="type-card-title">
                  {t("kept.title")}
                </h2>
              </div>
            </div>
            <dl className="flex w-full flex-col gap-2">
              <KeptRow label={t("kept.video")}>{t("kept.megabytes", { mb: kept.video_bytes })}</KeptRow>
              <KeptRow label={t("kept.frames")}>{t("kept.count", { count: kept.exam_frames })}</KeptRow>
              <KeptRow label={t("kept.events")}>{t("kept.count", { count: kept.exam_events })}</KeptRow>
              <KeptRow label={t("kept.for")}>{t("kept.days", { days: kept.retention_days })}</KeptRow>
            </dl>
          </section>
        </div>
      </main>
      {report.flags
        .filter((flag) => flag.frame_count > 0)
        .map((flag) => (
          <FlagStill key={flag.id} flagId={flag.id} frameCount={flag.frame_count} onStill={onStill} />
        ))}
    </>
  );
}
