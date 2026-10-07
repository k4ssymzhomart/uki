"use client";

import { isFinalState } from "@uki/contracts";
import { ActionMenu, type MenuAction, StudentTile, StudentTileMore } from "@uki/ui";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";
import { EndSessionDialog } from "./end-session-dialog.tsx";
import { pronounFromName } from "./names.ts";
import { useQuickMessageContent } from "./quick-message.tsx";
import { sameTileView, selectTileView } from "./tiles.ts";
import { useCommand } from "./use-command.ts";
import { useWall, useWallWith } from "./wall-store-context.tsx";
import { WriteMessageDialog } from "./write-message-dialog.tsx";

export interface WallTileProps {
  sessionId: string;
  /** Opens 2.5 for this session (?session=<id>). */
  onOpenTimeline: (sessionId: string) => void;
}

type MenuMode = "actions" | "message";

/** Lets Radix finish closing the menu (focus back on the tile) before the next layer opens. */
function afterMenuCloses(run: () => void): void {
  window.setTimeout(run, 0);
}

/**
 * One student on the wall (2.4). A click opens 2.4a; Message turns the same menu into 2.4b for this
 * student, so it opens at the tile. The tile re-renders only when its own view changes.
 */
export const WallTile = memo(function WallTile({ sessionId, onOpenTimeline }: WallTileProps) {
  const t = useTranslations("dashboard.wall");
  const view = useWallWith((state) => selectTileView(state, sessionId), sameTileView);
  const sessionState = useWall((state) => state.sessions[sessionId]?.state);
  const student = useWall((state) => {
    const session = state.sessions[sessionId];
    return session === undefined ? undefined : state.students[session.studentId];
  });
  const { send } = useCommand();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MenuMode>("actions");
  const [writing, setWriting] = useState(false);
  const [ending, setEnding] = useState(false);

  const name = view?.name ?? "";
  const target = { scope: "student", sessionId, name } as const;
  const message = useQuickMessageContent(target, () => afterMenuCloses(() => setWriting(true)));
  if (view === undefined || sessionState === undefined) return null;

  const final = isFinalState(sessionState);
  const paused = sessionState === "paused";
  const actions: MenuAction[][] = [
    [
      {
        id: "timeline",
        icon: "history",
        label: t("action.timeline"),
        shortcut: "T",
        onSelect: () => afterMenuCloses(() => onOpenTimeline(sessionId)),
      },
      {
        id: "message",
        icon: "message",
        label: t("action.message"),
        shortcut: "M",
        disabled: final,
        onSelect: () =>
          afterMenuCloses(() => {
            setMode("message");
            setOpen(true);
          }),
      },
    ],
    [
      paused
        ? {
            id: "resume",
            icon: "play",
            label: t("action.resume"),
            shortcut: "P",
            onSelect: () => void send({ session_id: sessionId, type: "resume", payload: {} }),
          }
        : {
            id: "pause",
            icon: "pause",
            label: t("action.pause"),
            shortcut: "P",
            disabled: sessionState !== "writing",
            onSelect: () => void send({ session_id: sessionId, type: "pause", payload: {} }),
          },
    ],
    [
      {
        id: "end",
        icon: "stop",
        label: t("action.end"),
        tone: "danger",
        disabled: final,
        onSelect: () => afterMenuCloses(() => setEnding(true)),
      },
    ],
  ];

  const tile = (
    <StudentTile
      state={view.tone}
      name={view.name}
      detail={t(view.line.key, view.line.values)}
      stateLabel={t("tile.state", { state: view.state })}
      data-session-id={sessionId}
      data-wall-state={view.state}
      trailing={<StudentTileMore />}
      className="w-full"
    />
  );
  const messaging = mode === "message";

  return (
    <>
      {/* One menu for 2.4a and 2.4b, so the tile (its trigger) never remounts and focus returns to it. */}
      <ActionMenu
        trigger={tile}
        header={messaging ? message.header : t("action.header", { name, number: student?.number ?? "" })}
        groups={messaging ? message.groups : actions}
        note={messaging ? message.note : undefined}
        open={open}
        alignOffset={12}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && messaging) afterMenuCloses(() => setMode("actions"));
        }}
        className={messaging ? "w-70" : "w-65"}
      />
      {writing ? <WriteMessageDialog target={target} open onOpenChange={setWriting} /> : null}
      {ending ? (
        <EndSessionDialog
          sessionId={sessionId}
          name={name}
          pronoun={pronounFromName(student?.fullName ?? "")}
          open
          onOpenChange={setEnding}
        />
      ) : null}
    </>
  );
});
