// Development gallery: every proctoring component, variant and state next to its Figma screenshot.
import { type ReactNode, useState } from "react";
import { assetUrl } from "../art/asset-url.ts";
import { Button } from "../controls/button.tsx";
import { CameraTile } from "./camera-tile.tsx";
import { ExtendTimePanel } from "./extend-time-panel.tsx";
import { ExtendTimePopover } from "./extend-time-popover.tsx";
import figmaWidget from "./figma/15-1264.png";
import figmaHud from "./figma/15-1303.png";
import figmaTimer from "./figma/15-1304.png";
import figmaTile from "./figma/15-1372.png";
import figmaCamera from "./figma/15-1373.png";
import figmaTileMenu from "./figma/75-2198.png";
import figmaQuickMenu from "./figma/75-2259.png";
import figmaStudent from "./figma/77-2318.png";
import figmaExtend from "./figma/83-2462.png";
import webcam from "./figma/webcam-frame.jpg";
import { HUD_KINDS, Hud } from "./hud.tsx";
import { LIVE_WIDGET_STATES, LiveWidget } from "./live-widget.tsx";
import { QuickMessageMenu } from "./quick-message-menu.tsx";
import { StudentPopover } from "./student-popover.tsx";
import { StudentPopoverCard } from "./student-popover-card.tsx";
import { STUDENT_TILE_STATES, StudentTile, StudentTileMore } from "./student-tile.tsx";
import { TileActionsMenu } from "./tile-actions-menu.tsx";
import { Timer } from "./timer.tsx";

export const title = "Proctoring";
export const order = 50;

function Pair({ name, figma, children }: { name: string; figma: string; children: ReactNode }) {
  return (
    <div className="mb-12 grid grid-cols-2 items-start gap-8">
      <div>
        <h3 className="type-ui-label mb-4">{name} · code</h3>
        {children}
      </div>
      <div>
        <h3 className="type-ui-label mb-4">{name} · Figma</h3>
        <img src={assetUrl(figma)} alt="" className="max-w-full rounded-md" />
      </div>
    </div>
  );
}

const noop = () => undefined;

const WIDGET_TEXT = {
  watching: ["Watching", "eyes on screen · 00:42:17"],
  "looked-away": ["Looked away", "off screen · 1.8 s"],
  phone: ["Phone found", "phone in frame · 0.94"],
  paused: ["Paused", "no face in frame"],
  submitted: ["Submitted", "0 flags · 58:02"],
  offline: ["Offline", "saving on this laptop · 00:00:16"],
} as const;

const HUD_TEXT = {
  gaze: ["Eyes on the screen", "2 s"],
  phone: ["Phone in frame. Put it away.", "flag"],
  tab: ["Other tabs stay closed until you submit.", "Esc"],
} as const;

const tileGroups = [
  [
    { id: "timeline", icon: "history", label: "Open timeline", shortcut: "T", onSelect: noop },
    { id: "camera", icon: "camera", label: "Watch camera", shortcut: "W", onSelect: noop },
    { id: "message", icon: "message", label: "Message", shortcut: "M", onSelect: noop },
  ],
  [
    { id: "pause", icon: "pause", label: "Pause exam", shortcut: "P", onSelect: noop },
    { id: "reviewed", icon: "check", label: "Mark reviewed", onSelect: noop },
  ],
  [{ id: "end", icon: "stop", label: "End session", tone: "danger", onSelect: noop }],
] as const;

const quickGroups = [
  [
    { id: "time", icon: "timer", label: "15 minutes left", shortcut: "1", onSelect: noop },
    { id: "phones", icon: "phone-off", label: "Phones away, please", shortcut: "2", onSelect: noop },
    { id: "camera", icon: "gaze", label: "Stay in camera view", shortcut: "3", onSelect: noop },
  ],
  [{ id: "write", icon: "edit", label: "Write a message", shortcut: "M", onSelect: noop }],
] as const;

const studentCard = {
  initials: "DK",
  name: "Dias Kenzhebekov",
  meta: "20231044 · Group 204",
  status: { status: "warn", label: "help" },
  step: "Check-in · step 2 of 4",
  stepMeta: "retry 2 of 3",
  steps: [
    { id: "system", label: "SYSTEM", state: "done" },
    { id: "identity", label: "IDENTITY", state: "warn" },
    { id: "rules", label: "RULES", state: "todo" },
    { id: "ready", label: "READY", state: "todo" },
  ],
  facts: [
    { id: "problem", label: "Problem", value: "Card unreadable" },
    { id: "camera", label: "Camera", value: "On · 1 face" },
    { id: "device", label: "Device", value: "Windows 11 · Wi-Fi" },
  ],
  secondaryAction: { label: "Message", onClick: noop },
  primaryAction: { label: "Verify by hand", onClick: noop },
} as const;

function ExtendTimeDemo({ popover }: { popover?: boolean }) {
  const [audience, setAudience] = useState("all");
  const [minutes, setMinutes] = useState("10");
  const panel = {
    title: "Extend time",
    audienceLabel: "WHO",
    audienceOptions: [
      { value: "all", label: "Everyone · 125" },
      { value: "one", label: "Madina T." },
    ],
    audience,
    onAudienceChange: setAudience,
    minutesLabel: "ADD",
    minuteOptions: [
      { value: "5", label: "+5 min" },
      { value: "10", label: "+10 min" },
      { value: "15", label: "+15 min" },
    ],
    minutes,
    onMinutesChange: setMinutes,
    note: "Ends at 11:40 instead of 11:30. Students see the new time at once.",
    submitLabel: `Add ${minutes} minutes`,
    onSubmit: noop,
  };
  if (popover) {
    return <ExtendTimePopover {...panel} trigger={<Button variant="secondary">Extend time</Button>} />;
  }
  return <ExtendTimePanel {...panel} />;
}

export default function ProctoringGallery() {
  return (
    <div>
      <Pair name="Student tile 15:1372" figma={figmaTile}>
        <div className="flex flex-col gap-4 rounded-md bg-canvas p-6">
          {STUDENT_TILE_STATES.map((state) => (
            <StudentTile
              key={state}
              state={state}
              name="Aigerim S."
              detail="00:42:17 · 0 flags"
              stateLabel={state}
            />
          ))}
        </div>
        <div
          data-theme="dark"
          className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-canvas p-6 text-fg-primary"
        >
          <StudentTile state="flag" name="Madina T." detail="phone 0.94 · 10:47" />
          <StudentTile state="warn" name="Dias K." detail="looked away 3× · 6 s" />
          <StudentTile state="paused" name="Zhansaya O." detail="no face · 00:42" />
          <StudentTile state="ok" name="Yerlan T." detail="on screen · Q 9" />
          <StudentTile state="ok" name="Focus state" detail="keyboard focus" className="shadow-focus" />
          <StudentTile state="ok" name="Disabled" detail="no actions" disabled />
          <StudentTile
            state="flag"
            name="Madina T."
            detail="hover: the ⋯ replaces the dot"
            trailing={<StudentTileMore />}
          />
          <StudentTile
            state="flag"
            name="Madina T."
            detail="menu open (2.4a)"
            data-state="open"
            trailing={<StudentTileMore />}
          />
        </div>
      </Pair>

      <Pair name="Camera tile 15:1373" figma={figmaCamera}>
        <CameraTile liveLabel="LIVE · LOCAL" facesLabel="1 face">
          <img src={assetUrl(webcam)} alt="" />
        </CameraTile>
        <CameraTile liveLabel="LIVE · LOCAL" facesLabel="2 faces" facesTone="flag" className="mt-4">
          <img src={assetUrl(webcam)} alt="" />
        </CameraTile>
      </Pair>

      <Pair name="Timer 15:1304" figma={figmaTimer}>
        <Timer time="42:17" label="left" progress={0.7} progressLabel="Time used" />
      </Pair>

      <Pair name="Widget/Live 15:1264" figma={figmaWidget}>
        <div className="flex flex-col items-start gap-6 rounded-md bg-canvas p-6">
          {LIVE_WIDGET_STATES.map((state) => (
            <LiveWidget
              key={state}
              state={state}
              title={WIDGET_TEXT[state][0]}
              detail={WIDGET_TEXT[state][1]}
            />
          ))}
          <div className="flex w-85 flex-col gap-4 bg-subtle p-0">
            <LiveWidget
              state="offline"
              title="Offline (340 px, 2.1a)"
              detail={WIDGET_TEXT.offline[1]}
              className="w-full"
            />
            <LiveWidget
              state="watching"
              title="Watching (276 px)"
              detail={WIDGET_TEXT.watching[1]}
              className="w-69"
            />
          </div>
        </div>
      </Pair>

      <Pair name="HUD 15:1303" figma={figmaHud}>
        <div className="flex flex-col items-start gap-6 rounded-md bg-canvas p-6">
          {HUD_KINDS.map((kind) => (
            <Hud key={kind} kind={kind} message={HUD_TEXT[kind][0]} meta={HUD_TEXT[kind][1]} />
          ))}
          <Hud kind="gaze" message="Hidden (visible=false)" visible={false} />
        </div>
      </Pair>

      <Pair name="Menu/Tile actions 75:2198" figma={figmaTileMenu}>
        <div className="flex h-100 items-start gap-6 rounded-md bg-canvas p-6">
          <TileActionsMenu
            open
            onOpenChange={noop}
            modal={false}
            header="MADINA T. · 20231187"
            groups={tileGroups}
            trigger={<Button variant="secondary">Open (pinned)</Button>}
          />
          <div className="ml-auto">
            <TileActionsMenu
              header="MADINA T. · 20231187"
              groups={tileGroups}
              trigger={
                <StudentTile
                  state="flag"
                  name="Madina T."
                  detail="click or Enter"
                  trailing={<StudentTileMore />}
                />
              }
            />
          </div>
        </div>
      </Pair>

      <Pair name="Menu/Quick message 75:2259" figma={figmaQuickMenu}>
        <div className="flex h-90 items-start gap-6 rounded-md bg-canvas p-6">
          <QuickMessageMenu
            open
            onOpenChange={noop}
            modal={false}
            header="QUICK MESSAGE · GROUP 204"
            groups={quickGroups}
            note="Each student reads it in their language."
            trigger={<Button variant="ghost">Message group (pinned)</Button>}
          />
        </div>
      </Pair>

      <Pair name="Popover/Extend time 83:2462" figma={figmaExtend}>
        <div className="flex flex-col items-start gap-6 rounded-md bg-canvas p-6">
          <ExtendTimeDemo />
          <ExtendTimeDemo popover />
        </div>
      </Pair>

      <Pair name="Popover/Student 77:2318" figma={figmaStudent}>
        <div className="flex flex-col items-start gap-6 rounded-md bg-canvas p-6">
          <StudentPopoverCard {...studentCard} />
          <StudentPopover
            {...studentCard}
            trigger={<StudentTile state="warn" name="Dias K." detail="Needs help · identity" />}
          />
        </div>
      </Pair>
    </div>
  );
}
