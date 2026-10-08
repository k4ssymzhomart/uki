import { Mascot } from "@uki/ui/art";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Button } from "./kit.tsx";
import { LandingLink } from "./landing-parts.tsx";

/**
 * CTA band (Figma 118:3538 at 1440, 193:4086 at 390): on the generated lime art with the celebrating
 * sticker (Mascot Sticker 3:39, exported from Figma as a transparent WebP); at 390 on moss-night with the hello mascot from the kit.
 */
export async function CtaBand() {
  const t = await getTranslations("dashboard.landing.cta");
  return (
    <section className="relative isolate overflow-clip px-6 py-16 lg:flex lg:items-center lg:gap-12 lg:px-16 lg:py-24">
      <Image
        src="/landing/moss-night.webp"
        alt=""
        fill
        unoptimized
        sizes="100vw"
        className="-z-10 object-cover lg:hidden"
      />
      <Image
        src="/landing/cta-lime.webp"
        alt=""
        fill
        unoptimized
        sizes="100vw"
        className="-z-10 hidden object-cover lg:block"
      />
      <div
        data-theme="dark"
        className="flex min-w-0 flex-1 flex-col items-start gap-4 text-fg-primary lg:hidden"
      >
        <p className="whitespace-nowrap text-brand type-mono-overline">{t("overline")}</p>
        <h2 className="type-h2">{t("title")}</h2>
        <Button variant="brand" asChild className="w-full">
          <LandingLink href="/pilot">{t("bookPilot")}</LandingLink>
        </Button>
        <Button variant="secondary" asChild className="w-full">
          <LandingLink href="/#product">{t("seeDemo")}</LandingLink>
        </Button>
        <div className="relative size-37.5">
          <Mascot pose="hello" size={150} className="absolute top-[17.29%] left-[10.63%] h-auto w-[78.56%]" />
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 flex-col items-start gap-6 text-fg-on-brand lg:flex">
        <p className="opacity-75 type-mono-tag">{t("overline")}</p>
        <h2 className="w-190 max-w-full type-display-m">{t("title")}</h2>
        <div className="flex gap-3">
          <Button asChild>
            <LandingLink href="/pilot">{t("bookPilot")}</LandingLink>
          </Button>
          <Button variant="secondary" asChild>
            <LandingLink href="/#product">{t("seeDemo")}</LandingLink>
          </Button>
        </div>
      </div>
      <div className="relative hidden size-85 shrink-0 lg:block">
        <Image
          src="/landing/sticker-celebrating.webp"
          alt=""
          width={576}
          height={550}
          unoptimized
          className="absolute top-[16.67%] left-[7.71%] h-auto w-[84.68%]"
        />
      </div>
    </section>
  );
}
