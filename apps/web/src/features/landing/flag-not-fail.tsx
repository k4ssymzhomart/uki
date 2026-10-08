import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { EvidenceCard, StatusDot } from "./kit.tsx";
import { Overline } from "./landing-parts.tsx";

const MOMENTS = [
  { id: "phone", status: "flag", still: "/landing/still-phone.webp", width: 504, height: 496 },
  { id: "gaze", status: "warn", still: "/landing/still-gaze.webp", width: 502, height: 496 },
  { id: "face", status: "flag", still: "/landing/still-second-face.webp", width: 500, height: 510 },
] as const;

/**
 * Flag ≠ fail (Figma 116:3458 at 1440, 193:4000 at 390): three Evidence cards from the kit with the
 * generated stills, or one flag card on lime at 390. Below 1280 the cards sit under the text, where
 * each is wide enough for its chip and time.
 */
export async function FlagNotFail() {
  const t = await getTranslations("dashboard.landing.flag");
  const phone = MOMENTS[0];
  return (
    <section className="bg-brand-subtle px-6 py-14 text-fg-primary lg:bg-canvas lg:px-16 lg:py-30 xl:flex xl:items-center xl:gap-16">
      <div className="flex flex-col gap-4 lg:w-120 lg:shrink-0 lg:gap-5">
        <Overline>{t("overline")}</Overline>
        <h2 className="type-h2 lg:type-display-l">{t("title")}</h2>
        <p className="opacity-80 type-body-s lg:w-110 lg:opacity-70 lg:type-body-m">{t("body")}</p>
      </div>
      <ul className="hidden min-w-0 flex-1 gap-5 lg:mt-12 lg:flex xl:mt-0">
        {MOMENTS.map((moment) => (
          <li key={moment.id} className="min-w-0 flex-1">
            <EvidenceCard
              image={
                <Image
                  src={moment.still}
                  alt={t(`${moment.id}.alt`)}
                  width={moment.width}
                  height={moment.height}
                  unoptimized
                  className="size-full object-cover"
                />
              }
              chipLabel={t(`${moment.id}.chip`)}
              chipStatus={moment.status}
              time={t(`${moment.id}.time`)}
              title={t(`${moment.id}.title`)}
              detail={t(`${moment.id}.detail`)}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2.5 rounded-card bg-surface px-3 pt-3 pb-3.5 lg:hidden">
        <Image
          src={phone.still}
          alt={t("phone.alt")}
          width={phone.width}
          height={phone.height}
          unoptimized
          className="h-47.5 w-full rounded-md object-cover"
        />
        <div className="flex items-center gap-2">
          <StatusDot tone="flag" className="size-2" />
          <span className="opacity-64 type-ui-mono">{t("phone.time")}</span>
          <span className="type-card-title">{t("phone.title")}</span>
        </div>
        <p className="opacity-72 type-card-caption">{t("phone.detail")}</p>
      </div>
    </section>
  );
}
