import { formatTime, type Locale } from "@uki/i18n";
import { Banner, Button } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { ExamModel } from "../../flow/view-model.ts";

export type NoticeBannersProps = {
  notice: ExamModel["notice"];
  offline: ExamModel["offline"];
  locale: Locale;
  onGotIt: () => void;
};

/**
 * The banners above the question: 2.1e's proctor message or added time with Got it (Banner Info,
 * 199:19002), then 2.1a's offline banner (Banner Offline, 145:2763). Both can show at once.
 */
export function NoticeBanners({ notice, offline, locale, onGotIt }: NoticeBannersProps) {
  const t = useTranslations();

  function noticeText(): { title: string; body: string | undefined } | null {
    if (notice === null) return null;
    const { message, timeAdded } = notice;
    if (message !== null) {
      return {
        title: t("message.title", {
          proctor: message.proctorName ?? "",
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
                proctor: timeAdded.proctorName,
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
      {offline === null ? null : (
        <Banner kind="offline" title={t("offline.title")} body={t("offline.body")} className="shrink-0" />
      )}
    </>
  );
}
