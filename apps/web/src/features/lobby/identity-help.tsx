"use client";

import type { CompactEvent, MessagePreset } from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import { Avatar, Button, Drawer, EventRow, initials, TextArea, useToast } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser.ts";
import { describeEvent } from "../wall/event-copy.ts";
import { messageRequest } from "../wall/message-target.ts";
import { shortName } from "../wall/names.ts";
import type { AnyClient } from "../wall/queries.ts";
import { presetId } from "../wall/quick-message.tsx";
import { useCommand } from "../wall/use-command.ts";
import { fetchIdentityHelp } from "./identity-help-data.ts";
import { cardTriesMeta, firstName, HINT_MAX, type LobbyRow } from "./lobby-model.ts";

export type IdentityHelpProps = {
  /** The student the drawer is for; null keeps it closed. */
  row: LobbyRow | null;
  onOpenChange: (open: boolean) => void;
  /** Tests pass a fake; the app reads through the browser client. */
  getClient?: () => AnyClient;
};

const browserClient = (): AnyClient => createSupabaseBrowserClient();

/** "09:52:05" in Asia/Almaty, as 1.5b's log prints each line. */
function clockOf(at: string): string {
  return formatTime(at, "en", { seconds: true });
}

/**
 * 1.5b Identity help (Figma 156:12176) over the lobby: the student held at the identity check by the
 * card, with the tries so far, the session's help requests and messages, and a hint in the proctor's own
 * words. Send hint issues a `message` command through the `command` function, which the student's app
 * shows as 2.1e over 1.3a. "What happens next" is left out: the plan builds only the hint (decisions).
 */
export function IdentityHelp({ row, onOpenChange, getClient = browserClient }: IdentityHelpProps) {
  const t = useTranslations("dashboard");
  const wall = useTranslations("dashboard.wall");
  const preset = useTranslations("message.preset");
  const locale = useDashboardLocale();
  const toast = useToast();
  const { send, pending } = useCommand();
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ sessionId: string; events: CompactEvent[] } | null>(null);
  const sessionId = row?.sessionId ?? null;

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    void fetchIdentityHelp(getClient, sessionId).then((events) => {
      if (!cancelled) setLog({ sessionId, events });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, getClient]);

  if (row === null || sessionId === null) return null;
  const name = firstName(row.name);
  const tries = cardTriesMeta(row.problem);
  const events = log?.sessionId === sessionId ? log.events : [];
  const request = messageRequest({ scope: "student", sessionId, name: shortName(row.name) }, { text });
  const close = () => {
    setText("");
    onOpenChange(false);
  };
  const sendHint = async () => {
    if (request === null || pending) return;
    if (await send(request)) {
      toast.show({ kind: "success", message: t("lobby.identityHelp.sent", { name }) });
      close();
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t("lobby.identityHelp.title")}
      closeLabel={t("lobby.identityHelp.close")}
      footer={
        <>
          <p className="min-w-0 flex-1 opacity-60 type-card-caption">{t("lobby.identityHelp.footer")}</p>
          <Button onClick={() => void sendHint()} loading={pending} disabled={request === null}>
            {t("lobby.identityHelp.send")}
          </Button>
        </>
      }
    >
      <div className="flex w-full items-center gap-3">
        <Avatar tone="paper" initials={initials(row.name, locale)} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 whitespace-nowrap">
          <p className="max-w-full truncate type-card-title">
            {t("common.withDetail", { main: row.name, detail: row.number })}
          </p>
          <p className="max-w-full truncate opacity-65 type-card-caption">
            {row.device
              ? t("lobby.device", { os: t(`lobby.os.${row.device.os}`), version: row.device.version })
              : t("lobby.noDevice")}
          </p>
        </div>
        {tries ? (
          <span className="shrink-0 whitespace-nowrap rounded-pill bg-flag-subtle px-2.5 py-1.25 type-ui-mono">
            {tries.key === "tries"
              ? t("lobby.card.tries", { tries: tries.tries, max: tries.max })
              : t("lobby.card.tries", { tries: tries.attempt, max: tries.max })}
          </span>
        ) : null}
      </div>

      {events.length > 0 ? (
        <div className="flex w-full flex-col">
          {events.map((event) => {
            const copy = describeEvent(event, {
              presetText: (key: MessagePreset) => preset(presetId(key)),
            });
            return (
              <EventRow
                key={event.id}
                kind={copy.kind}
                time={clockOf(event.at)}
                dateTime={event.at}
                title={wall(copy.title.key, copy.title.values)}
                detail={copy.detail ? wall(copy.detail.key, copy.detail.values) : undefined}
              />
            );
          })}
        </div>
      ) : null}

      <TextArea
        label={t("lobby.identityHelp.hint.label", { name })}
        placeholder={t("lobby.identityHelp.hint.placeholder")}
        value={text}
        maxLength={HINT_MAX}
        helper={t("lobby.identityHelp.hint.helper", {
          language: t(`myExams.language.${row.locale ?? "kk"}`),
          name,
          count: text.length,
          max: HINT_MAX,
        })}
        onChange={(event) => setText(event.target.value)}
      />
    </Drawer>
  );
}
