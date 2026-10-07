import { AppTitleBar } from "@uki/ui";
import { useTranslations } from "use-intl";
import { LanguageSwitch } from "../../components/language-switch.tsx";
import { useLocale } from "../../i18n/locale-context.ts";
import { useWindowOs } from "../../lib/use-window-os.ts";

/**
 * Skeleton screen (WP 0.1): one catalog key rendered in kk, ru and en through the language switch. Work
 * package 0.6 replaces it with 1.1 Join and the XState flow under src/renderer/flow and screens/.
 */
export function SampleScreen() {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const os = useWindowOs();
  return (
    <div className="flex h-full flex-col bg-canvas text-fg-primary">
      <AppTitleBar
        os={os}
        title={null}
        languageSwitch={<LanguageSwitch value={locale} onValueChange={setLocale} />}
      />
      <main className="flex flex-1 items-center justify-center p-8">
        <h1 className="type-ui-title">{t("join.title")}</h1>
      </main>
    </div>
  );
}
