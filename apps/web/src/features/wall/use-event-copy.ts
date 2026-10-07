"use client";

import type { CompactEvent, MessagePreset } from "@uki/contracts";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { describeEvent, type EventCopy } from "./event-copy.ts";
import { presetId } from "./quick-message.tsx";
import type { WallMessage } from "./wall-message.ts";
import { useWall } from "./wall-store-context.tsx";

/** describeEvent with the wall's staff names and the English preset texts, plus a translator. */
export function useEventCopy(): {
  describe: (event: CompactEvent) => EventCopy;
  text: (message: WallMessage) => string;
} {
  const t = useTranslations("dashboard.wall");
  const preset = useTranslations("message.preset");
  const staffNames = useWall((state) => state.staffNames);
  const describe = useCallback(
    (event: CompactEvent) =>
      describeEvent(event, { staffNames, presetText: (key: MessagePreset) => preset(presetId(key)) }),
    [staffNames, preset],
  );
  const text = useCallback((message: WallMessage) => t(message.key, message.values), [t]);
  return { describe, text };
}
