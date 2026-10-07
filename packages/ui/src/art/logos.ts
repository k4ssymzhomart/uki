// The logo set from the brand kit `logo/`: wordmark in three colourways, the eyes glyph and the app icon.

import { type AssetModule, assetUrl } from "./asset-url.ts";
import appIcon from "./logo/uki-app-icon.svg";
import eyes from "./logo/uki-eyes.svg";
import wordmarkInk from "./logo/uki-wordmark-ink.svg";
import wordmarkOnLime from "./logo/uki-wordmark-on-lime.svg";
import wordmarkPaper from "./logo/uki-wordmark-paper.svg";

export const LOGO_VARIANTS = [
  "wordmark-ink",
  "wordmark-paper",
  "wordmark-on-lime",
  "eyes",
  "app-icon",
] as const;

export type LogoVariant = (typeof LOGO_VARIANTS)[number];

const LOGO_FILES: Record<LogoVariant, AssetModule> = {
  "wordmark-ink": wordmarkInk,
  "wordmark-paper": wordmarkPaper,
  "wordmark-on-lime": wordmarkOnLime,
  eyes,
  "app-icon": appIcon,
};

export function logoSrc(variant: LogoVariant): string {
  return assetUrl(LOGO_FILES[variant]);
}
