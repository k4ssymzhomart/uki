import { createContext, type ReactNode, useContext } from "react";
import { format, PORTAL_MESSAGES, type PortalLocale, type PortalMessageKey } from "./messages.ts";

const LocaleContext = createContext<PortalLocale>("en");

export function PortalI18n({ locale, children }: { locale: PortalLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function usePortalLocale(): PortalLocale {
  return useContext(LocaleContext);
}

/** t("answered", { count: 3, total: 10 }) */
export function useT(): (key: PortalMessageKey, values?: Record<string, string | number>) => string {
  const locale = useContext(LocaleContext);
  return (key, values) => format(PORTAL_MESSAGES[locale][key], values);
}

/** 24-hour time in Asia/Almaty, as the portal shows it. */
export function portalTime(value: number, locale: PortalLocale, seconds = false): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
    timeZone: "Asia/Almaty",
  }).format(value);
}
