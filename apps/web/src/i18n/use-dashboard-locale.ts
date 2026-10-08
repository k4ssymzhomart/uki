"use client";

import { useLocale } from "next-intl";
import { type DashboardLocale, dashboardLocaleOf } from "./locale.ts";

/** The dashboard language this page renders in, from next-intl's locale (src/i18n/request.ts). */
export function useDashboardLocale(): DashboardLocale {
  return dashboardLocaleOf(useLocale());
}
