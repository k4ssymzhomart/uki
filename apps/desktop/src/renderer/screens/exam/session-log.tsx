import { formatTime, type Locale } from "@uki/i18n";
import { EventRow, type EventRowKind } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { LogEntry } from "../../flow/view-model.ts";
import { isoTime } from "../shared/format.ts";

type Line = { kind: EventRowKind; title: string; detail?: string };

function useLine() {
  const t = useTranslations();
  return (entry: LogEntry, locale: Locale): Line => {
    switch (entry.kind) {
      case "exam_started":
        return {
          kind: "info",
          title: t("event.exam_started"),
          detail:
            entry.tabsClosed === null ? undefined : t("event.browser_locked", { count: entry.tabsClosed }),
        };
      case "on_screen":
        return {
          kind: "ok",
          title: t("event.on_screen"),
          detail: entry.faceMatched ? t("event.face_matched") : undefined,
        };
      case "question_saved":
        return {
          kind: "info",
          title: t("event.question_saved", { n: entry.n }),
          detail: t("event.stored_locally"),
        };
      case "phone":
        return {
          kind: "flag",
          title: t("event.phone.title"),
          detail: t("event.phone.detail", { confidence: entry.confidence }),
        };
      case "no_face":
        return { kind: "warn", title: t("event.no_face"), detail: t("event.paused.detail") };
      case "network_lost":
        return { kind: "warn", title: t("event.network_lost.title"), detail: t("event.network_lost.detail") };
      case "proctor_paused":
        return {
          kind: "warn",
          title: t("event.proctor_paused.title", { proctor: entry.proctorName ?? "" }),
          detail: t("event.proctor_paused.detail"),
        };
      case "time_added":
        return {
          kind: "ok",
          title: t("event.time_added.title", { minutes: entry.minutes }),
          detail:
            entry.proctorName === null
              ? undefined
              : t("event.time_added.detail", {
                  proctor: entry.proctorName,
                  time: formatTime(entry.endsAt, locale),
                }),
        };
    }
  };
}

export type SessionLogProps = { entries: readonly LogEntry[]; locale: Locale; headingId: string };

/** "This session": the laptop's own event lines, newest first (Figma Event row 46:2165). */
export function SessionLog({ entries, locale, headingId }: SessionLogProps) {
  const t = useTranslations();
  const line = useLine();
  return (
    <section aria-labelledby={headingId} className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <h2 id={headingId} className="shrink-0 type-card-title">
        {t("exam.log.title")}
      </h2>
      <ol className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {entries.map((entry) => {
          const { kind, title, detail } = line(entry, locale);
          return (
            <li key={entry.id}>
              <EventRow
                kind={kind}
                time={formatTime(entry.at, locale, { seconds: true })}
                dateTime={isoTime(entry.at)}
                title={title}
                detail={detail}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
