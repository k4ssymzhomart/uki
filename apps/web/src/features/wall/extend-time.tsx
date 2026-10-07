"use client";

import { ADD_TIME_CHOICES } from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import { ExtendTimePopover } from "@uki/ui";
import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";
import { examEndsAt } from "./exam-end.ts";
import { useCommand } from "./use-command.ts";
import { useWall } from "./wall-store-context.tsx";

/** Sessions a group command reaches: rules, ready, writing or paused (plan, API). */
const GROUP_STATES = new Set(["rules", "ready", "writing", "paused"]);

/** 2.4c Extend time (Figma 85:6750): 5, 10 or 15 minutes for everyone, with the new end shown first. */
export function ExtendTime({ examId, trigger }: { examId: string; trigger: ReactElement }) {
  const t = useTranslations("dashboard.wall.extend");
  const { send, pending } = useCommand();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(String(ADD_TIME_CHOICES[1]));
  const reached = useWall(
    (state) => Object.values(state.sessions).filter((s) => GROUP_STATES.has(s.state)).length,
  );
  // Recomputed only when the sessions or the exam change, not on every tick.
  const endMs = useWall((state) => examEndsAt(state.exam, Object.values(state.sessions)).getTime());
  const added = Number(minutes);

  return (
    <ExtendTimePopover
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      title={t("title")}
      audienceLabel={t("who")}
      audienceOptions={[{ value: "everyone", label: t("everyone", { count: reached }) }]}
      audience="everyone"
      minutesLabel={t("add")}
      minuteOptions={ADD_TIME_CHOICES.map((m) => ({ value: String(m), label: t("option", { minutes: m }) }))}
      minutes={minutes}
      onMinutesChange={setMinutes}
      note={t("note", {
        newEnd: formatTime(endMs + added * 60_000, "en"),
        oldEnd: formatTime(endMs, "en"),
      })}
      submitLabel={t("submit", { minutes: added })}
      submitting={pending}
      submitDisabled={reached === 0}
      onSubmit={async () => {
        if (pending) return;
        const sent = await send({
          exam_id: examId,
          scope: "group",
          type: "add_time",
          payload: { minutes: added, scope: "group" },
        });
        if (sent) setOpen(false);
      }}
    />
  );
}
