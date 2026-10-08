import { Icon } from "@uki/ui/icon";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Badge } from "./kit.tsx";
import type { LandingLocale } from "./landing-model.ts";
import { type LegalDocument, sectionNumber } from "./legal-content.ts";
import { LegalToc } from "./legal-toc.tsx";
import { SiteHeader } from "./site-header.tsx";

/** Keys come from legal-content.ts; legal-content.test.ts checks each one exists in English and Russian. */
type Translate = (key: string) => string;

/**
 * Privacy policy (Figma 196:4125) and Terms of use (197:4144): the header band on the generated
 * moss-night art with the draft tag, "On this page", "In short" and the numbered sections. The text is
 * a draft for legal review, and says so.
 */
export async function LegalPage({
  document: doc,
  locale,
}: {
  document: LegalDocument;
  locale: LandingLocale;
}) {
  const tLanding = await getTranslations("dashboard.landing");
  const t = tLanding as unknown as Translate;
  const key = (...parts: string[]) => [doc.namespace, ...parts].join(".");
  const toc = doc.sections.map((section) => ({ id: section.id, label: t(key(section.id, "title")) }));

  return (
    <>
      <section data-theme="dark" className="relative isolate overflow-clip text-fg-primary lg:h-100">
        <Image
          src="/landing/moss-night.webp"
          alt=""
          fill
          preload
          unoptimized
          sizes="100vw"
          className="-z-10 object-cover"
        />
        <SiteHeader locale={locale} />
        <div className="mx-auto flex w-full max-w-300 flex-col items-start gap-4 px-6 pt-10 pb-14 lg:px-16 lg:pt-20.5 lg:pb-0 xl:px-0">
          <div className="flex items-center gap-3">
            <p className="text-brand type-mono-overline">{tLanding("legal.overline")}</p>
            <Badge className="px-2.5 text-fg-on-brand">{tLanding("legal.draft")}</Badge>
          </div>
          <h1 className="type-h2 lg:type-h1">{t(key("title"))}</h1>
          <p className="opacity-64 type-mono-s">{tLanding("legal.meta")}</p>
        </div>
      </section>
      <div className="mx-auto flex w-full max-w-300 gap-20 px-6 pt-10 pb-20 lg:px-16 lg:pt-20 lg:pb-30 xl:px-0">
        <div className="hidden lg:flex">
          <LegalToc heading={tLanding("legal.onThisPage")} items={toc} />
        </div>
        <article className="flex min-w-0 flex-col gap-10 lg:w-190">
          <div className="flex flex-col gap-3 rounded-card bg-brand-subtle px-7 py-6">
            <h2 className="type-card-title">{tLanding("legal.inShort")}</h2>
            <ul className="flex flex-col gap-3">
              {doc.short.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <Icon name="check" className="mt-0.5 size-4.5 shrink-0 text-ok" />
                  <span className="type-body-s">{t(key(point))}</span>
                </li>
              ))}
            </ul>
          </div>
          {doc.sections.map((section, index) => (
            <section key={section.id} id={section.id} className="flex scroll-mt-6 flex-col gap-3.5">
              <h2 className="flex items-baseline gap-3.5">
                <span className="text-fg-accent type-mono-s">{sectionNumber(index)}</span>
                <span className="type-ui-title">{t(key(section.id, "title"))}</span>
              </h2>
              {section.blocks.map((block) =>
                block.kind === "p" ? (
                  <p key={block.key} className="opacity-80 type-body-m">
                    {t(key(section.id, block.key))}
                  </p>
                ) : (
                  <ul key={block.keys.join()} className="flex flex-col gap-2.5">
                    {block.keys.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-fg-accent"
                        />
                        <span className="opacity-80 type-body-m">{t(key(section.id, item))}</span>
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
