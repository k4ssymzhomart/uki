"use client";

// 2.4d (Figma 155:11803): the Requests button on the live wall's toolbar with its popover of open Ask
// proctor requests. Reply asks for the proctor's words and Mark done closes without them; both call
// close_help_request, whose `help` broadcast clears the request on every proctor's wall.
import type { HelpRequest } from "@uki/contracts";
import { MESSAGE_TEXT_MAX } from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import {
  Button,
  Dialog,
  HelpRequestRow,
  HelpRequestsPopover,
  initials,
  shortName,
  TextArea,
  ToastContext,
} from "@uki/ui";
import { useTranslations } from "next-intl";
import { useContext, useEffect, useState } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { closeHelpRequest } from "./help-data.ts";
import { openCount, openRequests, REASON_TONE } from "./help-model.ts";
import { useHelp, useHelpClient } from "./help-store.tsx";

/** Calls close_help_request; a failure shows the wall's error toast. Success applies the closed row. */
function useCloseHelp() {
  const client = useHelpClient();
  const apply = useHelp((state) => state.actions.apply);
  const toast = useContext(ToastContext);
  const t = useTranslations("dashboard.wall");
  const [pending, setPending] = useState<string | null>(null);

  async function close(id: string, reply?: string): Promise<boolean> {
    if (client === null || pending !== null) return false;
    setPending(id);
    try {
      const result = await closeHelpRequest(client, reply === undefined ? { id } : { id, reply });
      if (!result.ok) {
        toast?.show({ kind: "error", message: t("error", { code: result.code }) });
        return false;
      }
      apply(result.request);
      return true;
    } finally {
      setPending(null);
    }
  }

  return { close, pending };
}

function ReplyDialog({
  request,
  onOpenChange,
}: {
  request: HelpRequest;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("dashboard.wall");
  const { close, pending } = useCloseHelp();
  const [text, setText] = useState("");
  const reply = text.trim();
  const valid = reply.length > 0 && reply.length <= MESSAGE_TEXT_MAX;
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      icon="message"
      title={t("help.reply")}
      body={t("message.dialogBody", { target: shortName(request.student_name) })}
      cancelLabel={t("message.cancel")}
      confirmLabel={t("message.send")}
      confirmLoading={pending !== null}
      confirmDisabled={!valid}
      onConfirm={async () => {
        if (!valid) return;
        if (await close(request.id, reply)) onOpenChange(false);
      }}
    >
      <TextArea
        label={t("message.field")}
        value={text}
        maxLength={MESSAGE_TEXT_MAX}
        helper={t("message.counter", { count: text.length, max: MESSAGE_TEXT_MAX })}
        onChange={(event) => setText(event.target.value)}
      />
    </Dialog>
  );
}

/**
 * "Requests · 2" (Button Brand) between the sort tabs and Message group, shown while requests are
 * open; it opens the 2.4d popover. The exam office reads the requests; only the exam's proctors get
 * Reply and Mark done.
 */
export function HelpRequestsButton() {
  const t = useTranslations("dashboard.wall");
  const locale = useDashboardLocale();
  const count = useHelp(openCount);
  const requests = useHelp(openRequests);
  const canAnswer = useHelp((state) => state.canAnswer);
  const { close, pending } = useCloseHelp();
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState<HelpRequest | null>(null);

  // The last request closed (here or on another proctor's wall): nothing left to show.
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  if (count === 0 && replying === null) return null;

  return (
    <>
      {count === 0 ? null : (
        <HelpRequestsPopover
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button variant="brand" data-help-count={count}>
              {t("help.button", { count })}
            </Button>
          }
          title={t("help.title")}
          count={t("help.open", { count })}
          footer={t("help.footer")}
          alignOffset={-60}
        >
          {requests.map((request) => (
            <HelpRequestRow
              key={request.id}
              data-help-id={request.id}
              initials={initials(request.student_name)}
              name={shortName(request.student_name)}
              reason={t("help.topic", { topic: request.topic })}
              reasonTone={REASON_TONE[request.topic]}
              time={formatTime(request.created_at, locale)}
              text={request.text === null ? undefined : t("help.text", { text: request.text })}
              actions={
                canAnswer ? (
                  <>
                    <Button
                      variant="secondary"
                      disabled={pending !== null}
                      onClick={() => {
                        setOpen(false);
                        setReplying(request);
                      }}
                    >
                      {t("help.reply")}
                    </Button>
                    <Button
                      variant="ghost"
                      loading={pending === request.id}
                      disabled={pending !== null && pending !== request.id}
                      onClick={() => void close(request.id)}
                    >
                      {t("help.done")}
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))}
        </HelpRequestsPopover>
      )}
      {replying === null ? null : (
        <ReplyDialog
          request={replying}
          onOpenChange={(next) => {
            if (!next) setReplying(null);
          }}
        />
      )}
    </>
  );
}
