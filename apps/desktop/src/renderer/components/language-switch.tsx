import { BCP47, isLocale, LOCALE_LABELS, LOCALES, type Locale } from "@uki/i18n";
import { Tab, TabGroup } from "@uki/ui";

export type LanguageSwitchProps = { value: Locale; onValueChange: (locale: Locale) => void };

/** ҚАЗ, РУС, ENG as in App/Title bar (Figma 150:13352); labels come from the catalog's language.* keys. */
export function LanguageSwitch({ value, onValueChange }: LanguageSwitchProps) {
  return (
    <TabGroup
      value={value}
      onValueChange={(next) => {
        if (isLocale(next)) onValueChange(next);
      }}
    >
      {LOCALES.map((locale) => (
        <Tab key={locale} value={locale} lang={BCP47[locale]}>
          {LOCALE_LABELS[locale]}
        </Tab>
      ))}
    </TabGroup>
  );
}
