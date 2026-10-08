// Renders dashboard components the way the app does: next-intl with the dashboard messages (English
// unless a test asks for Russian), Asia/Almaty, and (for pages under the (app) layout) the signed-in
// staff member and the toast region. Every next-intl error (a missing message, a bad value) is kept in
// `intlErrors`, so a test can fail on any of them.
import { type RenderResult, render } from "@testing-library/react";
import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";
import { ToastProvider } from "@uki/ui";
import { type IntlError, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach } from "vitest";
import { StaffContext, type StaffIdentity } from "../src/features/shell/staff-context.ts";
import type { DashboardLocale } from "../src/i18n/locale.ts";

export const messages = loadMessages("en");

/** next-intl errors raised since the test began: MISSING_MESSAGE, FORMATTING_ERROR and the like. */
export const intlErrors: IntlError[] = [];
afterEach(() => {
  intlErrors.length = 0;
});

/** The provider props the app's request config gives a page in `locale`. */
export function intlProps(locale: DashboardLocale = "en") {
  return {
    locale: BCP47[locale],
    messages: loadMessages(locale),
    timeZone: TIME_ZONE,
    formats,
    onError: (error: IntlError) => {
      intlErrors.push(error);
    },
  };
}

export const DANA: StaffIdentity = {
  initials: "DA",
  fullName: "Dana Akhmetova",
  email: "dana.akhmetova@kru.test",
  role: "exam_office",
  workspaceName: "KRU · Kostanay",
  facultyName: "Faculty of Mathematics",
};

export function renderWithIntl(
  ui: ReactNode,
  staff: StaffIdentity | null = null,
  locale: DashboardLocale = "en",
): RenderResult {
  const tree = (
    <NextIntlClientProvider {...intlProps(locale)}>
      {staff ? (
        <StaffContext value={staff}>
          <ToastProvider label="Notifications" closeLabel="Close">
            {ui}
          </ToastProvider>
        </StaffContext>
      ) : (
        ui
      )}
    </NextIntlClientProvider>
  );
  return render(tree);
}

/** Text of the rendered page that still looks like a message key, which means a missing message. */
export function rawKeys(container: HTMLElement): string[] {
  return (container.textContent ?? "").match(/\bdashboard\.[a-zA-Z0-9_.]+/g) ?? [];
}
