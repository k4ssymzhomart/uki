import { Mascot } from "@uki/ui/art";
import { Icon } from "@uki/ui/icon";
import { useTranslations } from "next-intl";
import { DOWNLOAD_CARDS, RELEASES_URL, releaseAssetUrl } from "./download-model.ts";
import { SECTION } from "./landing-model.ts";
import { cx, Overline } from "./landing-parts.tsx";

const NOTES = ["mac", "windows", "lock"] as const;

/** A download card's frame: surface on the section's canvas, the kit's default stroke. */
const CARD = "flex rounded-md bg-surface p-4 text-fg-primary inset-ring inset-ring-line-default";
const LINK = "outline-none transition-colors hover:bg-hover focus-visible:shadow-focus";

/**
 * The download block (decided by the user on 8 October: "Download" goes to the latest published GitHub
 * release; no Figma frame, docs/decisions.md). Between the CTA band and the footer, so every section of
 * the frames keeps its place. Each card links to the newest release's copy of one file; Üki Lock has one
 * file per browser. The first-launch notes are for the unsigned builds, as the release notes give them.
 * Built from the landing's own parts and tokens; the mascot is the kit's pointing pose. Not async, so
 * the Russian render test can draw it. The jury page (/demo) shows the same files.
 */
export function DownloadSection() {
  const t = useTranslations("dashboard.landing.download");
  return (
    <section
      id={SECTION.download}
      aria-labelledby="download-title"
      className="flex scroll-mt-6 flex-col gap-8 border-line-default border-b bg-canvas px-6 py-14 text-fg-primary lg:flex-row lg:items-start lg:gap-18 lg:border-0 lg:px-16 lg:py-24"
    >
      <div className="flex flex-col items-start gap-4 lg:w-100 lg:shrink-0 lg:gap-5">
        <Overline>{t("overline")}</Overline>
        <h2 id="download-title" className="type-h3 lg:type-h2">
          {t("title")}
        </h2>
        <p className="opacity-70 type-body-s lg:type-body-m">{t("body")}</p>
        <Mascot pose="pointing" size={160} className="hidden size-40 lg:block" />
      </div>
      <DownloadFiles className="min-w-0 flex-1" />
    </section>
  );
}

/**
 * The release's files: one card per installer (Üki Lock with one file per browser), the first-launch
 * notes for the unsigned builds and the release page, for the download block on `/` and the jury page.
 */
export function DownloadFiles({ className }: { className?: string }) {
  const t = useTranslations("dashboard.landing.download");
  return (
    <div className={cx("flex flex-col gap-6", className)}>
      <ul className="grid gap-3 lg:grid-cols-2">
        {DOWNLOAD_CARDS.map((card) => {
          const head = (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-brand-subtle">
                <Icon name={card.icon} className="size-5.5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-card-title">{t(`${card.id}.title`)}</span>
                <span className="opacity-60 type-card-caption">{t(`${card.id}.detail`)}</span>
              </span>
            </>
          );
          if (card.id !== "lock") {
            const [file] = card.files;
            return (
              <li key={card.id}>
                <a href={releaseAssetUrl(file.asset)} className={`${CARD} ${LINK} h-full items-center gap-4`}>
                  {head}
                  <Icon name="download" className="size-5 shrink-0" />
                </a>
              </li>
            );
          }
          return (
            <li key={card.id} className={`${CARD} flex-wrap items-center gap-4 lg:col-span-2`}>
              {head}
              <span className="flex w-full gap-2 lg:w-auto">
                {card.files.map((file) => (
                  <a
                    key={file.id}
                    href={releaseAssetUrl(file.asset)}
                    aria-label={t(`lock.${file.id}Label`)}
                    className={`${LINK} inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-pill px-4 py-2.5 type-label-m inset-ring-2 inset-ring-line-strong lg:flex-none`}
                  >
                    <Icon name="download" className="size-4.5" />
                    {t(`lock.${file.id}`)}
                  </a>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2">
        <h3 className="type-card-title">{t("notes")}</h3>
        <ul className="flex flex-col gap-1.5">
          {NOTES.map((note) => (
            <li key={note} className="opacity-70 type-body-s">
              {t(`note.${note}`)}
            </li>
          ))}
        </ul>
      </div>
      <a
        href={RELEASES_URL}
        className="inline-flex items-center gap-1.5 self-start rounded-sm type-label-m outline-none hover:underline focus-visible:shadow-focus"
      >
        {t("all")}
        <Icon name="external-link" className="size-4.5" />
      </a>
    </div>
  );
}
