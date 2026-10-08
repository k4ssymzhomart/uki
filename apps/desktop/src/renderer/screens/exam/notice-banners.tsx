import { formatTime, type Locale } from "@uki/i18n";
import { Banner, Button, shortName } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { ExamModel } from "../../flow/view-model.ts";

export type NoticeBannersProps = {
  notice: ExamModel["notice"];
  offline: ExamModel["offline"];
  /** Phase 1: Ask proctor's request is queued (2.1 to 2.3). */
  help?: ExamModel["help"];
  locale: Locale;
  onGotIt: () => void;
  /** Got it on the help-requested banner. */
  onHelpGotIt?: () => void;
};

/**
 * The banners above the question: 2.1e's proctor message or added time with Got it (Banner Info,
 * 199:19002), then the help-requested banner after Ask proctor (1.3a's Banner Info: "Help requested at
 * 10:47" with E.5a's line), then 2.1a's offline banner (Banner Offline, 145:2763). They can show
 * together. The proctor is named by first name and initial, as in Figma ("Message from Aigerim S. ·
 * 10:31"). Also over 1.3 and 1.3a, where only a message shows.
 */
export function NoticeBanners({ notice, offline, help, locale, onGotIt, onHelpGotIt }: NoticeBannersProps) {
  const t = useTranslations();

  function noticeText(): { title: string; body: string | undefined } | null {
    if (notice === null) return null;
    const { message, timeAdded } = notice;
    if (message !== null) {
      return {
        title: t("message.title", {
          proctor: shortName(message.proctorName ?? ""),
          time: formatTime(message.at, locale),
        }),
        body: t("message.body", { text: message.text ?? t(message.preset) }),
      };
    }
    if (timeAdded !== null) {
      return {
        title: t("event.time_added.title", { minutes: timeAdded.minutes }),
        body:
          timeAdded.proctorName === null
            ? undefined
            : t("event.time_added.detail", {
                proctor: shortName(timeAdded.proctorName),
                time: formatTime(timeAdded.endsAt, locale),
              }),
      };
    }
    return null;
  }

  const text = noticeText();
  return (
    <>
      {text === null ? null : (
        <Banner
          kind="info"
          title={text.title}
          body={text.body}
          className="shrink-0"
          action={
            <Button variant="secondary" onClick={onGotIt}>
              {t("message.ack")}
            </Button>
          }
        />
      )}
      {help ? (
        <Banner
          kind="info"
          data-help-requested=""
          title={t("identity.help.requested", { time: formatTime(help.requestedAt, locale) })}
          body={t("lock.ask.body")}
          className="shrink-0"
          action={
            <Button variant="secondary" onClick={onHelpGotIt}>
              {t("message.ack")}
            </Button>
          }
        />
      ) : null}
      {offline === null ? null : (
        <Banner kind="offline" title={t("offline.title")} body={t("offline.body")} className="shrink-0" />
      )}
    </>
  );
}
