"use client";

import type {
  ExamDraft,
  ProctorAssignment,
  ScheduleProblem,
  WizardStep,
  WorkspaceSettings,
} from "@uki/contracts";
import { Button, cn, EventRow, useToast } from "@uki/ui";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { dayOf, formatGroupCodes, timeOf, weekdayOf } from "../../lib/format.ts";
import { AppLink } from "../shell/app-link.tsx";
import { scheduleExam, sendTestInvite, type WizardError } from "./wizard-actions.ts";
import { WizardFrame } from "./wizard-frame.tsx";
import {
  almatyParts,
  checkChips,
  examTimes,
  previousStep,
  SEND_INVITES_READY,
  stepHref,
} from "./wizard-model.ts";

export type ReviewViewProps = {
  exam: ExamDraft;
  settings: WorkspaceSettings | null;
  /** The codes of the exam's groups. */
  groupCodes: readonly string[];
  rosterSize: number;
  assignments: readonly ProctorAssignment[];
};

const FILE_NAME_KEY = "uki.wizard.rosterFile.";

function SummaryCard({
  title,
  editHref,
  children,
}: {
  title: string;
  editHref: string;
  children: ReactNode;
}) {
  const t = useTranslations("dashboard.wizard");
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex w-full flex-col gap-3.5 rounded-card border border-line-default bg-surface px-5.5 py-5"
    >
      <div className="flex w-full items-center justify-between">
        <h2 id={id} className="type-card-title">
          {title}
        </h2>
        <AppLink
          href={editHref}
          className="rounded-sm text-fg-accent underline outline-none type-label-m focus-visible:shadow-focus"
        >
          {t("edit")}
        </AppLink>
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-4 type-ui-label">
      <dt className="w-32.5 shrink-0 opacity-60">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/**
 * 0.5 New exam · Review (Figma 159:12771): every step summed up with an Edit link back to it, what
 * happens when the exam is scheduled, and Send a test invite to me. Schedule exam runs schedule_exam:
 * a problem shows with a link to the step that fixes it; success returns to 0.1 with the exam code.
 * send-invites is WP 1.4, so the test invite stays disabled with its reason until it exists.
 */
export function ReviewView({ exam, settings, groupCodes, rosterSize, assignments }: ReviewViewProps) {
  const t = useTranslations("dashboard.wizard");
  const tc = useTranslations("dashboard");
  const locale = useDashboardLocale();
  const toast = useToast();
  const [scheduling, setScheduling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [failure, setFailure] = useState<{ problem: ScheduleProblem; step: WizardStep } | WizardError | null>(
    null,
  );
  const [file, setFile] = useState<{ name: string; valid: number; total: number } | null>(null);
  const lobbyMinutes = settings?.lobby_minutes ?? 20;
  const times = examTimes(exam.starts_at, exam.duration_min, lobbyMinutes);
  const language = (code: "kk" | "ru" | "en") => t(`language.${code}`);
  const waiting = assignments.filter((row) => row.confirmed_at === null);
  const groups =
    groupCodes.length === 0
      ? t("review.details.missing")
      : tc("common.groups", { count: groupCodes.length, codes: formatGroupCodes(groupCodes) });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILE_NAME_KEY + exam.id);
      const value = raw ? (JSON.parse(raw) as { name?: unknown; valid?: unknown; total?: unknown }) : null;
      if (
        value &&
        typeof value.name === "string" &&
        typeof value.valid === "number" &&
        typeof value.total === "number" &&
        value.valid === rosterSize
      ) {
        setFile({ name: value.name, valid: value.valid, total: value.total });
      }
    } catch {
      setFile(null);
    }
  }, [exam.id, rosterSize]);

  const schedule = async () => {
    setScheduling(true);
    setFailure(null);
    const result = await scheduleExam({ exam_id: exam.id });
    // On success the action redirects to the overview, so only a failure comes back.
    setScheduling(false);
    setFailure("problem" in result ? { problem: result.problem, step: result.step } : result.error);
  };

  const test = async () => {
    setTesting(true);
    const result = await sendTestInvite({ exam_id: exam.id });
    setTesting(false);
    toast.show(
      result.ok
        ? { kind: "success", message: t("review.testInviteSent") }
        : { kind: "error", message: t("review.testInviteFailed") },
    );
  };

  const when = (iso: string) => t("review.next.when", { weekday: weekdayOf(iso, locale), time: timeOf(iso) });
  const back = previousStep("review", exam.mode);

  return (
    <WizardFrame
      step="review"
      footer={
        waiting.length > 0
          ? t("review.footerWaiting", { names: waiting.map((row) => row.full_name).join(", ") })
          : t("review.footerReady")
      }
      error={
        failure === null ? null : typeof failure === "string" ? (
          t(`error.${failure}`)
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2">
            {t(`review.problem.${failure.problem}`)}
            <AppLink href={stepHref(exam.id, failure.step)} className="underline type-label-m">
              {t("review.problemLink", { step: t(`review.stepName.${failure.step}`) })}
            </AppLink>
          </span>
        )
      }
      actions={
        <>
          {back ? (
            <Button variant="ghost" asChild>
              <AppLink href={stepHref(exam.id, back)}>{t("back")}</AppLink>
            </Button>
          ) : null}
          <Button variant="secondary" asChild>
            <AppLink href="/overview">{t("review.saveDraft")}</AppLink>
          </Button>
          <Button onClick={() => void schedule()} loading={scheduling}>
            {t("review.schedule")}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SummaryCard title={t("review.details.title")} editHref={stepHref(exam.id, "details")}>
            <dl className="flex w-full flex-col gap-3.5">
              <SummaryRow label={t("review.details.exam")}>
                {exam.title === "" ? t("review.details.missing") : exam.title}
              </SummaryRow>
              <SummaryRow label={t("review.details.when")}>
                {t("review.details.whenValue", {
                  date: dayOf(exam.starts_at, locale),
                  year: almatyParts(exam.starts_at).date.slice(0, 4),
                  start: timeOf(exam.starts_at),
                  end: timeOf(times.endsAt),
                  minutes: exam.duration_min,
                })}
              </SummaryRow>
              <SummaryRow label={t("review.details.students")}>
                {t("review.details.studentsValue", { groups, count: rosterSize })}
              </SummaryRow>
              <SummaryRow label={t("review.details.runsIn")}>
                {exam.mode === "app" ? t("review.details.app") : t("review.details.browser")}
              </SummaryRow>
            </dl>
          </SummaryCard>
          <SummaryCard title={t("review.checks.title")} editHref={stepHref(exam.id, "checks")}>
            <ul className="flex w-full flex-wrap gap-2">
              {checkChips(exam).map((chip) => {
                const label =
                  chip.key === "gaze"
                    ? t("review.checks.gaze", { seconds: chip.value ?? 0 })
                    : chip.key === "phone"
                      ? t("review.checks.phone", { score: chip.value ?? 0 })
                      : chip.key === "lock" && !chip.on
                        ? t("review.checks.lockOff")
                        : chip.key === "identity" && !chip.on
                          ? t("review.checks.identityOff")
                          : t(
                              `review.checks.${chip.key as "lock" | "identity" | "secondPerson" | "microphone"}`,
                            );
                return (
                  <li
                    key={chip.key}
                    className={cn(
                      "flex items-center gap-1.5 rounded-pill py-1.5 pr-3 pl-2.5 type-ui-mono",
                      chip.on ? "bg-ok-subtle" : "bg-subtle",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("size-1.75 rounded-pill", chip.on ? "bg-ok" : "bg-fg-primary/28")}
                    />
                    {label}
                  </li>
                );
              })}
            </ul>
          </SummaryCard>
          <SummaryCard title={t("review.people.title")} editHref={stepHref(exam.id, "roster")}>
            <dl className="flex w-full flex-col gap-3.5">
              <SummaryRow label={t("review.people.roster")}>
                {file
                  ? t("review.people.rosterFile", { valid: file.valid, total: file.total, file: file.name })
                  : t("review.people.rosterValue", { count: rosterSize })}
              </SummaryRow>
              {assignments.length === 0 ? (
                <SummaryRow label={t("roster.proctors.title")}>{t("review.people.noProctors")}</SummaryRow>
              ) : (
                assignments.map((row) => (
                  <SummaryRow key={row.staff_id} label={row.full_name}>
                    {t("review.people.proctorValue", {
                      from: row.seat_from ?? 0,
                      to: row.seat_to ?? 0,
                      languages: row.languages.map(language).join(", "),
                      state: row.confirmed_at ? t("review.people.confirmed") : t("review.people.waiting"),
                    })}
                  </SummaryRow>
                ))
              )}
            </dl>
          </SummaryCard>
        </div>
        <section className="flex w-95 shrink-0 flex-col items-start gap-3.5 rounded-card border border-line-default bg-surface px-5.5 py-5">
          <h2 className="type-card-title">{t("review.next.title")}</h2>
          <div className="flex w-full flex-col">
            <EventRow
              kind="ok"
              time={t("review.next.now")}
              title={t("review.next.invites", { count: rosterSize })}
              detail={t("review.next.invitesDetail")}
            />
            <EventRow
              time={when(times.lobbyOpensAt)}
              dateTime={times.lobbyOpensAt}
              title={t("review.next.lobby")}
              detail={t("review.next.lobbyDetail", { minutes: lobbyMinutes })}
            />
            <EventRow
              time={when(exam.starts_at)}
              dateTime={exam.starts_at}
              title={t("review.next.start")}
              detail={t("review.next.startDetail")}
            />
            <EventRow
              time={when(times.endsAt)}
              dateTime={times.endsAt}
              title={t("review.next.end")}
              detail={t("review.next.endDetail")}
            />
          </div>
          <Button
            variant="secondary"
            disabled={!SEND_INVITES_READY}
            loading={testing}
            onClick={() => void test()}
            aria-describedby={SEND_INVITES_READY ? undefined : `${exam.id}-invites`}
          >
            {t("review.testInvite")}
          </Button>
          {SEND_INVITES_READY ? null : (
            <p id={`${exam.id}-invites`} className="opacity-60 type-ui-caption">
              {t("review.invitesUnavailable")}
            </p>
          )}
        </section>
      </div>
    </WizardFrame>
  );
}
