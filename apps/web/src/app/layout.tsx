import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * Root layout. NextIntlClientProvider inherits locale, messages, time zone and formats from
 * src/i18n/request.ts. Every Phase 0 screen is Light except the live wall and its drawer, which render
 * under data-theme="dark".
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-canvas font-sans text-fg-primary antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
