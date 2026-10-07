import type { Locale } from "@uki/i18n";
import { createContext, useContext } from "react";

export type LocaleState = { locale: Locale; setLocale: (locale: Locale) => void };

export const LocaleContext = createContext<LocaleState | null>(null);

/** The student's language (ҚАЗ, РУС, ENG) and its setter; 1.1 switches it, join_exam records it. */
export function useLocale(): LocaleState {
  const state = useContext(LocaleContext);
  if (!state) throw new Error("useLocale needs <UkiIntlProvider>");
  return state;
}
