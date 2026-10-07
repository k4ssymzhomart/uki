import { Logo, Mascot } from "@uki/ui/art";
import { Icon } from "@uki/ui/icon";
import type { IconName } from "@uki/ui/icons";
import Image from "next/image";
import { useTranslations } from "next-intl";
import mossNight from "../../assets/uki-bg-moss-night.png";

const FACTS = [
  { id: "video", icon: "eye-off" },
  { id: "human", icon: "shield-check" },
  { id: "languages", icon: "globe" },
] as const satisfies readonly { id: string; icon: IconName }[];

/**
 * The ink brand half of A.0 (Figma 177:15947): the moss-night background from the brand kit, the paper
 * wordmark, the pitch, the shield mascot and three glass facts. Decorative except for its text.
 */
export function BrandPanel() {
  const t = useTranslations("dashboard.signIn.brand");
  return (
    <section className="relative flex h-full w-2/5 shrink-0 flex-col overflow-clip p-14 pb-27 xl:w-160">
      {/* Unoptimized: re-encoding turns the brand kit's film grain into blocks. */}
      <Image src={mossNight} alt="" fill preload unoptimized className="object-cover" />
      <Logo variant="wordmark-paper" className="relative h-10 w-auto self-start" />
      <span aria-hidden="true" className="max-h-38 min-h-8 flex-1" />
      <div className="relative z-10 flex flex-col items-start gap-4">
        <p className="text-brand type-mono-tag">{t("overline")}</p>
        <p className="max-w-125 text-fg-inverse type-h2">{t("title")}</p>
        <p className="max-w-110 text-fg-inverse opacity-72 type-body-m">{t("body")}</p>
      </div>
      <span aria-hidden="true" className="min-h-8 flex-1" />
      <Mascot
        pose="shield"
        className="pointer-events-none absolute bottom-51.25 left-84.5 size-56 max-xl:hidden"
      />
      <ul className="relative flex flex-col items-start gap-2.5">
        {FACTS.map((fact) => (
          <li
            key={fact.id}
            className="flex items-center gap-2.5 overflow-clip rounded-pill border border-line-glass bg-glass py-2.5 pr-4.5 pl-3.5 backdrop-blur-sm"
          >
            <Icon name={fact.icon} className="size-4.5 text-brand" />
            <span className="whitespace-nowrap text-fg-inverse type-label-m">{t(`fact.${fact.id}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
