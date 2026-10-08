"use client";

import type { CompactEvent, ReviewDecisionValue } from "@uki/contracts";
import { REVIEW_DECISIONS } from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import {
  Button,
  Chip,
  type ChipStatus,
  EventRow,
  EvidenceCard,
  Icon,
  Input,
  RadioGroup,
  RadioOption,
  useToast,
} from "@uki/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { timeOf } from "../../lib/format.ts";
import { PageHeader } from "../shell/page-header.tsx";
import { EVENT_KIND } from "../wall/event-copy.ts";
import { useFunctionsClient } from "../wall/use-command.ts";
import { type Still, useStills } from "../wall/use-stills.ts";
import { decideSession } from "./review-actions.ts";
import { flagChip, type ReviewMessage } from "./review-copy.ts";
import type { SessionReviewData } from "./review-data.ts";
import { type FlagEvent, flagRank, queuePosition, type ReviewSession } from "./review-model.ts";
import { useEventCopy } from "./use-review-copy.ts";

const NOTE_MAX = 1000;

/** The flags as 3.3 lays them out: by rank (phone first), then by time. */
function orderedFlags(session: ReviewSession): FlagEvent[] {
  return [...session.flags].sort(
    (a, b) => flagRank(a.type) - flagRank(b.type) || Date.parse(a.at) - Date.parse(b.at),
  );
}

function chipStatusOf(flag: FlagEvent): ChipStatus {
  return EVENT_KIND[flag.type] === "flag" ? "flag" : "warn";
}

/** One evidence card (Figma Evidence card 46:2166): its own stills, reported up for the large frame. */
function FlagCard({
  flag,
  selected,
  onSelect,
  onStills,
}: {
  flag: FlagEvent;
  selected: boolean;
  onSelect: () => void;
  onStills: (flagId: string, stills: Still[]) => void;
}) {
  const t = useTranslations("dashboard.review");
  const { describe, text, flagDetail } = useEventCopy();
  const getClient = useFunctionsClient();
  const stills = useStills({ eventId: flag.id, frameCount: flag.frame_count, confirmed: 0, getClient });
  useEffect(() => {
    onStills(flag.id, stills.stills);
  }, [flag.id, stills.stills, onStills]);
  const copy = describe(flag);
  const chip = flagChip(flag);
  const still = stills.stills[0];
  const time = formatTime(flag.at, "en", { seconds: true });
  const title = text(copy.title);
  const detail = flagDetail(flag);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={t("session.showFlag", { flag: title, time })}
      onClick={onSelect}
      className="flex min-w-0 cursor-pointer rounded-md text-left outline-none focus-visible:shadow-focus"
    >
      <EvidenceCard
        className="w-full"
        image={
          still === undefined ? undefined : (
            // biome-ignore lint/performance/noImgElement: signed 5-minute URLs must not pass through the Next.js image cache
            <img
              src={still.url}
              alt={t("session.still", { index: 1, count: stills.stills.length, time })}
              className="size-full object-cover"
            />
          )
        }
        chipLabel={chip === undefined ? title : t(chip.key, chip.values)}
        chipStatus={chipStatusOf(flag)}
        time={timeOf(flag.at)}
        dateTime={flag.at}
        title={title}
        detail={detail}
      />
    </button>
  );
}

export type SessionReviewViewProps = SessionReviewData;

/**
 * 3.3 Session review (Figma 51:2094): the summary chips, the selected still with its stamp, one
 * evidence card per flag, the timeline with notes, and the decision form, which calls decide_session
 * and moves on to the next session of the exam's queue. Skip moves on without a decision.
 */
export function SessionReviewView({ group, sessionId, events, staffNames }: SessionReviewViewProps) {
  const t = useTranslations("dashboard.review");
  const report = useTranslations("dashboard.report");
  const router = useRouter();
  const toast = useToast();
  const { describe, text } = useEventCopy(staffNames);
  const session = group.sessions.find((s) => s.id === sessionId);
  const flags = session === undefined ? [] : orderedFlags(session);
  const [selectedId, setSelectedId] = useState<string | null>(session?.top?.id ?? flags[0]?.id ?? null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [stillsByFlag, setStillsByFlag] = useState<Record<string, Still[]>>({});
  const [decision, setDecision] = useState<ReviewDecisionValue | null>(session?.decision?.decision ?? null);
  const [note, setNote] = useState(session?.decision?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [onStills] = useState(
    () => (flagId: string, stills: Still[]) =>
      setStillsByFlag((current) => (current[flagId] === stills ? current : { ...current, [flagId]: stills })),
  );

  if (session === undefined) return null;
  const position = queuePosition(group, sessionId);
  const next = position?.next ?? null;
  const goNext = () => router.push(next === null ? "/review" : `/review/${next}`);
  const selected = flags.find((flag) => flag.id === selectedId) ?? flags[0];
  const selectedStills = selected === undefined ? [] : (stillsByFlag[selected.id] ?? []);
  const frame = selectedStills[Math.min(frameIndex, Math.max(0, selectedStills.length - 1))];
  const identity =
    session.identityResult === "matched" || events.some((event) => event.type === "identity.matched")
      ? "matched"
      : "unchecked";
  const top = session.top;
  const topCopy = top === null ? undefined : describe(top);
  const frames = session.flags.reduce((sum, flag) => sum + flag.frame_count, 0);
  const render = (message: ReviewMessage) => t(message.key, message.values);
  const breadcrumb =
    position !== null && position.index > 0
      ? t("session.breadcrumb", { exam: group.exam.title, index: position.index, total: position.total })
      : t("breadcrumb.exam", { exam: group.exam.title });

  const save = async () => {
    if (decision === null || saving) return;
    setSaving(true);
    const trimmed = note.trim();
    const result = await decideSession({
      session_id: sessionId,
      decision,
      ...(trimmed === "" ? {} : { note: trimmed }),
    });
    if (!result.ok) {
      setSaving(false);
      toast.show({ kind: "error", message: t("error", { code: result.code }) });
      return;
    }
    goNext();
  };

  const stampFlag = (flag: FlagEvent) => {
    const chip = flagChip(flag);
    return chip === undefined ? text(describe(flag).title) : render(chip);
  };

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={session.name} />
      <main className="flex items-start gap-6 px-8 pt-6 pb-7">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
          <div className="flex w-full flex-wrap items-center gap-2">
            <Chip status={session.flags.length > 0 ? "flag" : "ok"}>
              {t("session.chip.flags", { count: session.flags.length })}
            </Chip>
            <Chip status={identity === "matched" ? "ok" : "idle"}>
              {t("session.chip.identity", { result: identity })}
            </Chip>
            {session.minutes === null ? null : (
              <Chip status="idle">
                {t("session.chip.time", { used: session.minutes, duration: group.exam.durationMin })}
              </Chip>
            )}
            <Chip status="ok">{t("session.chip.noVideo")}</Chip>
            {/* WP 1.9: 3.4 opens from here; 3.3 draws no entry (docs/decisions.md, 1.9). */}
            <Button variant="ghost" asChild className="ml-auto">
              <Link href={`/review/${sessionId}/report`}>
                <Icon name="report" className="size-5" />
                {report("title")}
              </Link>
            </Button>
          </div>

          {selected === undefined ? null : (
            <div className="relative h-95 w-full max-w-150 shrink-0 overflow-clip rounded-xl bg-subtle">
              {frame === undefined ? null : (
                <button
                  type="button"
                  className="absolute inset-0 cursor-pointer outline-none focus-visible:shadow-focus"
                  onClick={() => setFrameIndex((index) => (index + 1) % Math.max(1, selectedStills.length))}
                >
                  {/* biome-ignore lint/performance/noImgElement: signed 5-minute URLs must not pass through the Next.js image cache */}
                  <img
                    src={frame.url}
                    alt={t("session.still", {
                      index: selectedStills.indexOf(frame) + 1,
                      count: selectedStills.length,
                      time: formatTime(frame.captured_at, "en", { seconds: true }),
                    })}
                    className="size-full object-cover"
                  />
                </button>
              )}
              <p className="pointer-events-none absolute top-4 left-4 rounded-pill bg-inverse px-3 py-1.5 text-fg-inverse opacity-88 type-mono-s">
                {t("session.stamp", {
                  time: formatTime(selected.at, "en", { seconds: true }),
                  flag: stampFlag(selected),
                  index: frame === undefined ? 1 : selectedStills.indexOf(frame) + 1,
                  count: selectedStills.length || selected.frame_count,
                })}
              </p>
            </div>
          )}

          {flags.length === 0 ? null : (
            <ul aria-label={t("session.flags")} className="grid w-full grid-cols-3 items-start gap-3">
              {flags.map((flag) => (
                <li key={flag.id} className="flex min-w-0">
                  <FlagCard
                    flag={flag}
                    selected={flag.id === selected?.id}
                    onSelect={() => {
                      setSelectedId(flag.id);
                      setFrameIndex(0);
                    }}
                    onStills={onStills}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex w-105 shrink-0 flex-col gap-4">
          <section
            aria-labelledby="review-timeline-title"
            className="flex max-h-120 w-full flex-col items-start overflow-y-auto rounded-card border border-line-default bg-surface px-4.5 pt-4 pb-4.5"
          >
            <h2 id="review-timeline-title" className="type-card-title">
              {t("session.timeline")}
            </h2>
            <ol className="flex w-full flex-col">
              {events.map((event: CompactEvent) => {
                const copy = describe(event);
                return (
                  <li key={event.id}>
                    <EventRow
                      kind={copy.kind}
                      time={formatTime(event.at, "en", { seconds: true })}
                      dateTime={event.at}
                      title={text(copy.title)}
                      detail={copy.detail === undefined ? undefined : text(copy.detail)}
                      data-event-type={event.type}
                    />
                  </li>
                );
              })}
            </ol>
          </section>

          <section
            aria-labelledby="review-decision-title"
            className="flex w-full flex-col items-start gap-2 rounded-card border border-line-default bg-surface px-4.5 pt-4 pb-4.5"
          >
            <h2 id="review-decision-title" className="type-card-title">
              {t("session.decision.title")}
            </h2>
            <RadioGroup
              aria-labelledby="review-decision-title"
              value={decision ?? ""}
              onValueChange={(value) => {
                const chosen = REVIEW_DECISIONS.find((d) => d === value);
                if (chosen !== undefined) setDecision(chosen);
              }}
              className="w-full gap-2"
            >
              {REVIEW_DECISIONS.map((value) => (
                <RadioOption
                  key={value}
                  value={value}
                  title={t(`session.decision.${value}.title`)}
                  detail={
                    value === "talk"
                      ? t("session.decision.talk.detail", {
                          what:
                            top === null || topCopy === undefined
                              ? "none"
                              : text(topCopy.feed ?? topCopy.title),
                          time: top === null ? "" : timeOf(top.at),
                        })
                      : value === "committee"
                        ? t("session.decision.committee.detail", { count: frames })
                        : t("session.decision.no_issue.detail")
                  }
                />
              ))}
            </RadioGroup>
            <Input
              label={t("session.note")}
              value={note}
              maxLength={NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              className="w-full"
            />
            <div className="flex w-full items-start justify-end gap-2.5 pt-1">
              <Button variant="ghost" onClick={goNext} disabled={saving}>
                {t("session.skip")}
              </Button>
              <Button
                variant="primary"
                loading={saving}
                disabled={decision === null}
                onClick={() => void save()}
              >
                {t("session.save")}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
