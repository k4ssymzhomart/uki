import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "../features/pwa/service-worker-registration.tsx";
import "./globals.css";

/**
 * Root layout. NextIntlClientProvider inherits locale, messages, time zone and formats from
 * src/i18n/request.ts. Every Phase 0 screen is Light except the live wall and its drawer, which render
 * under data-theme="dark". In production the service worker (public/sw.js) is registered for the
 * offline page; the manifest (app/manifest.ts) and the icons make the dashboard installable.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-canvas font-sans text-fg-primary antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
