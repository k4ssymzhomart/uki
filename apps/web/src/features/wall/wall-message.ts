// A message to render later: a dashboard.wall.* key and its ICU values. Pure code builds these; the
// components translate them with useTranslations("dashboard.wall"), so no copy lives in logic.
import type { Messages } from "@uki/i18n";
import type { MessageKeys, NestedKeyOf } from "next-intl";

type WallMessages = Messages["dashboard"]["wall"];

/** Every key under dashboard.wall, for example "tile.phone" or "event.gaze_down.title". */
export type WallKey = MessageKeys<WallMessages, NestedKeyOf<WallMessages>>;

export type WallValues = Record<string, string | number>;

export interface WallMessage {
  key: WallKey;
  values?: WallValues;
}

export function message(key: WallKey, values?: WallValues): WallMessage {
  return values === undefined ? { key } : { key, values };
}

/** Same key and the same values. */
export function sameMessage(a: WallMessage | undefined, b: WallMessage | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a.key !== b.key) return false;
  const av = a.values ?? {};
  const bv = b.values ?? {};
  const keys = Object.keys(av);
  if (keys.length !== Object.keys(bv).length) return false;
  return keys.every((k) => av[k] === bv[k]);
}
