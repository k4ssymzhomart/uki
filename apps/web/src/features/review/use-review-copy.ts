"use client";

import type { CompactEvent, MessagePreset } from "@uki/contracts";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
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
} {
  const t = useTranslations("dashboard.wall");
  const preset = useTranslations("message.preset");
  const describe = useCallback(
    (event: CompactEvent) =>
      describeEvent(event, { staffNames, presetText: (key: MessagePreset) => preset(presetId(key)) }),
    [staffNames, preset],
  );
  const text = useCallback((message: WallMessage) => t(message.key, message.values), [t]);
  return { describe, text };
}
