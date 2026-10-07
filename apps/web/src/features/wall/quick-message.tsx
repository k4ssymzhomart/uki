"use client";

import type { MessagePreset } from "@uki/contracts";
import { type IconName, type MenuAction, QuickMessageMenu } from "@uki/ui";
import { useTranslations } from "next-intl";
import { type ReactElement, type ReactNode, useState } from "react";
import { type MessageTarget, messageRequest, presetsFor } from "./message-target.ts";
import { useCommand } from "./use-command.ts";
import { WriteMessageDialog } from "./write-message-dialog.tsx";

const PRESET_ICON: Record<MessagePreset, IconName> = {
  "message.preset.time_15": "timer",
  "message.preset.phones_away": "phone-off",
  "message.preset.phone_away": "phone-off",
  "message.preset.camera_view": "gaze",
};

/** The short key under message.preset ("time_15"). */
export function presetId(preset: MessagePreset): "time_15" | "phones_away" | "phone_away" | "camera_view" {
  return preset.slice("message.preset.".length) as "time_15" | "phones_away" | "phone_away" | "camera_view";
}

export interface QuickMessageContent {
  header: ReactNode;
  groups: readonly (readonly MenuAction[])[];
  note: ReactNode;
}

/**
 * The content of Menu/Quick message (2.4b) for a target: presets with keys 1 to 3, then Write a message
 * (M). Choosing a preset sends it at once; `onWrite` opens the free-text dialog.
 */
export function useQuickMessageContent(target: MessageTarget, onWrite: () => void): QuickMessageContent {
  const t = useTranslations("dashboard.wall.message");
  const preset = useTranslations("message.preset");
  const { send } = useCommand();
  const presets = presetsFor(target).map(
    (key, index): MenuAction => ({
      id: key,
      icon: PRESET_ICON[key],
      label: preset(presetId(key)),
      shortcut: String(index + 1),
      onSelect: () => {
        const request = messageRequest(target, { preset: key });
        if (request !== null) void send(request);
      },
    }),
  );
  return {
    header:
      target.scope === "group"
        ? t("headerGroup", { group: target.label })
        : t("headerStudent", { name: target.name }),
    groups: [presets, [{ id: "write", icon: "edit", label: t("write"), shortcut: "M", onSelect: onWrite }]],
    note: t("note"),
  };
}

export interface QuickMessageProps {
  target: MessageTarget;
  /** The element that opens the menu: "Message group" on the wall, "Message everyone" in the lobby. */
  trigger: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/**
 * 2.4b Quick message (Figma 85:6635): presets each student reads in their own language, or the
 * proctor's own words through Write a message. Reused by the lobby's Message everyone (1.5).
 */
export function QuickMessage({ target, trigger, side = "bottom", align = "start" }: QuickMessageProps) {
  const [writing, setWriting] = useState(false);
  // Radix closes the menu after onSelect; the dialog opens once the menu has let go of focus.
  const content = useQuickMessageContent(target, () => window.setTimeout(() => setWriting(true), 0));
  return (
    <>
      <QuickMessageMenu
        trigger={trigger}
        header={content.header}
        groups={content.groups}
        note={content.note}
        side={side}
        align={align}
      />
      <WriteMessageDialog target={target} open={writing} onOpenChange={setWriting} />
    </>
  );
}
