/**
 * `import "@uki/i18n/polyfill"`: Kazakh Intl for Electron and Chromium, whose ICU has no Kazakh data.
 * Import it first in every entry that formats numbers, dates or plurals (the desktop renderer, the Lock
 * popup, blocked page and content script), before React or anything else creates a formatter. It changes
 * nothing where the runtime already formats Kazakh (Node, browsers with full ICU). See kk-intl/install.ts.
 */
import { installKazakhIntl, type KazakhIntlStatus } from "./kk-intl/install.ts";

/** What this runtime formats natively and what the polyfill routes. */
export const kazakhIntlStatus: KazakhIntlStatus = installKazakhIntl();
