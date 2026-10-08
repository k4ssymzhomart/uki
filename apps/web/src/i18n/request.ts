import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getStaffMember } from "../lib/auth.ts";
import {
  type DashboardLocale,
  LOCALE_COOKIE,
  parseDashboardLocale,
  resolveDashboardLocale,
} from "./locale.ts";

/**
 * The dashboard language of this request: the `uki_locale` cookie, else the signed-in staff member's
 * first language (Russian unless it is English), else English. The staff lookup is the one the layout
 * and the page share (cached per request), and it is only made when there is no cookie.
 */
export async function requestLocale(): Promise<DashboardLocale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (parseDashboardLocale(cookie)) return resolveDashboardLocale(cookie, null);
  const lookup = await getStaffMember();
  return resolveDashboardLocale(cookie, lookup.status === "staff" ? lookup.staff.languages : null);
}

/**
 * next-intl without i18n routing: the locale comes from the cookie or the staff member per request
 * (no locale in the URL); every time is shown in Asia/Almaty.
 */
export default getRequestConfig(async () => {
  const locale = await requestLocale();
  return {
    locale: BCP47[locale],
    messages: loadMessages(locale),
    timeZone: TIME_ZONE,
    formats,
  };
});
