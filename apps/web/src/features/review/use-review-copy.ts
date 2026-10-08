"use client";

import type { CompactEvent, MessagePreset } from "@uki/contracts";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toSeconds } from "../wall/durations.ts";
import { describeEvent, type EventCopy } from "../wall/event-copy.ts";
import { presetId } from "../wall/quick-message.tsx";
import type { WallMessage } from "../wall/wall-message.ts";

const NO_NAMES: Readonly<Record<string, string>> = {};

/**
 * The wall's event wording (titles, details and dots as 2.4 and 2.5 write them) for the review pages,
 * which have no wall store: staff names come from the page's data.
 */
export function useEventCopy(staffNames: Readonly<Record<string, string>> = NO_NAMES): {
  describe: (event: CompactEvent) => EventCopy;
  text: (message: WallMessage) => string;
  /** A flag card's detail, as 2.5's flag card: "Held for 6 s" for a phone, the timeline's otherwise. */
  flagDetail: (event: CompactEvent) => string | undefined;
} {
  const t = useTranslations("dashboard.wall");
  const preset = useTranslations("message.preset");
  const describe = useCallback(
    (event: CompactEvent) =>
      describeEvent(event, { staffNames, presetText: (key: MessagePreset) => preset(presetId(key)) }),
    [staffNames, preset],
  );
  const text = useCallback((message: WallMessage) => t(message.key, message.values), [t]);
  const flagDetail = useCallback(
    (event: CompactEvent) => {
      const held = event.type === "phone.detected" ? event.data.held_ms : undefined;
      if (typeof held === "number") return t("event.phone_detected.held", { seconds: toSeconds(held) });
      const detail = describe(event).detail;
      return detail === undefined ? undefined : text(detail);
    },
    [t, describe, text],
  );
  return { describe, text, flagDetail };
}
