// Renders dashboard components the way the app does: next-intl with the English dashboard messages,
// Asia/Almaty, and (for pages under the (app) layout) the signed-in staff member and the toast region.
import { type RenderResult, render } from "@testing-library/react";
import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";
import { ToastProvider } from "@uki/ui";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { StaffContext, type StaffIdentity } from "../src/features/shell/staff-context.ts";

export const messages = loadMessages("en");

export const DANA: StaffIdentity = {
  initials: "DA",
  fullName: "Dana Akhmetova",
  email: "dana.akhmetova@kru.test",
  role: "exam_office",
  workspaceName: "KRU · Kostanay",
  facultyName: "Faculty of Mathematics",
};

export function renderWithIntl(ui: ReactNode, staff: StaffIdentity | null = null): RenderResult {
  const tree = (
    <NextIntlClientProvider locale={BCP47.en} messages={messages} timeZone={TIME_ZONE} formats={formats}>
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
