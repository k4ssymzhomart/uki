import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";
import { getRequestConfig } from "next-intl/server";
import { DASHBOARD_LOCALE } from "./locale.ts";

export { DASHBOARD_LOCALE } from "./locale.ts";

/** next-intl without i18n routing: one locale for the whole dashboard, Asia/Almaty for every time. */
export default getRequestConfig(async () => ({
  locale: BCP47[DASHBOARD_LOCALE],
  messages: loadMessages(DASHBOARD_LOCALE),
  timeZone: TIME_ZONE,
  formats,
}));
