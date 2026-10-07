"use client";

import { END_REASON_MAX } from "@uki/contracts";
import { Dialog, TextArea } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Pronoun } from "./names.ts";
import { useCommand } from "./use-command.ts";

export interface EndSessionDialogProps {
  sessionId: string;
  /** The wall's short name: "Arman B.". */
  name: string;
  pronoun: Pronoun;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 2.4e End session (Figma 181:18746): a required reason up to 200 characters goes into the `end`
 * command; "Keep him writing" closes the dialog and sends nothing.
 */
export function EndSessionDialog({ sessionId, name, pronoun, open, onOpenChange }: EndSessionDialogProps) {
  const t = useTranslations("dashboard.wall.end");
  const { send, pending } = useCommand();
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      tone="danger"
      title={t("title", { name })}
      body={t("body", { pronoun })}
      cancelLabel={t("cancel", { pronoun })}
      confirmLabel={t("confirm")}
      confirmLoading={pending}
      confirmDisabled={trimmed.length === 0}
      onConfirm={async () => {
        if (trimmed.length === 0 || pending) return;
        const sent = await send({ session_id: sessionId, type: "end", payload: { reason: trimmed } });
        if (sent) {
          setReason("");
          onOpenChange(false);
        }
      }}
    >
      <TextArea
        label={t("reason")}
        value={reason}
        required
        maxLength={END_REASON_MAX}
        helper={t("helper", { count: reason.length, max: END_REASON_MAX })}
        onChange={(event) => setReason(event.target.value)}
      />
    </Dialog>
  );
}
