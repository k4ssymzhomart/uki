"use client";

import { useEffect } from "react";
import { SERVICE_WORKER_URL, shouldRegisterServiceWorker } from "./pwa-model.ts";

/** Registers public/sw.js once the page has loaded (production only). Renders nothing. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!shouldRegisterServiceWorker(process.env.NODE_ENV, globalThis)) return;
    navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" }).catch(() => {
      // Without the worker the dashboard works as before; only the offline page is missing.
    });
  }, []);
  return null;
}
