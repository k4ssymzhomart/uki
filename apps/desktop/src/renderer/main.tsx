// First: Zod without its eval probe, before anything creates a schema (lib/zod-jitless.ts).
import "./lib/zod-jitless.ts";
// Then Kazakh Intl for Electron, whose ICU has no Kazakh, before anything creates a formatter.
import "@uki/i18n/polyfill";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
