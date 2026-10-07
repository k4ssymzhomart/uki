"use client";

import { MESSAGE_TEXT_MAX } from "@uki/contracts";
import { Dialog, TextArea } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type MessageTarget, messageRequest } from "./message-target.ts";
import { useCommand } from "./use-command.ts";

export interface WriteMessageDialogProps {
  target: MessageTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Write a message" from 2.4b: the proctor's own words, up to 280 characters, sent as typed (only
 * presets are translated). Built on the UI kit's Dialog, as Figma draws no frame for it.
 */
export function WriteMessageDialog({ target, open, onOpenChange }: WriteMessageDialogProps) {
  const t = useTranslations("dashboard.wall.message");
  const { send, pending } = useCommand();
  const [text, setText] = useState("");
  const request = messageRequest(target, { text });
  const who = target.scope === "group" ? t("everyone", { group: target.label }) : target.name;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setText("");
        onOpenChange(next);
      }}
      icon="edit"
      title={t("write")}
      body={t("dialogBody", { target: who })}
      cancelLabel={t("cancel")}
      confirmLabel={t("send")}
      confirmLoading={pending}
      confirmDisabled={request === null}
      onConfirm={async () => {
        if (request === null || pending) return;
        if (await send(request)) {
          setText("");
          onOpenChange(false);
        }
      }}
    >
      <TextArea
        label={t("field")}
        value={text}
        maxLength={MESSAGE_TEXT_MAX}
        helper={t("counter", { count: text.length, max: MESSAGE_TEXT_MAX })}
        onChange={(event) => setText(event.target.value)}
      />
    </Dialog>
  );
}
