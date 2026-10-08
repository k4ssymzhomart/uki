import { createUkiTranslator } from "@uki/i18n";
import { colour } from "@uki/tokens";
import type { MetadataRoute } from "next";
import { PWA_ICONS } from "../features/pwa/pwa-model.ts";

/**
 * The web app manifest (judge mode): installable in Chrome and Edge from any page; the app opens on
 * `/`, which sends signed-in staff to their home and everyone else to the landing page. English, the
 * language of the frames: a manifest has one language. Icons are the brand kit's app icon set.
 */
export default function manifest(): MetadataRoute.Manifest {
  const t = createUkiTranslator("en", "dashboard.pwa");
  return {
    id: "/",
    name: t("name"),
    short_name: t("shortName"),
    description: t("description"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: colour("bg-canvas"),
    theme_color: colour("bg-inverse"),
    icons: [...PWA_ICONS],
  };
}
