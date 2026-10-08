// Development gallery: every Üki Lock component, variant and state next to its Figma screenshot.
import type { ReactNode } from "react";
import { assetUrl } from "../art/asset-url.ts";
import figmaToolbar from "./figma/89-2491.png";
import figmaToast from "./figma/89-2492.png";
import figmaBar from "./figma/90-2549.png";
import figmaHeader from "./figma/92-2533.png";
import figmaFooter from "./figma/92-2546.png";
import figmaPair from "./figma/92-2552.png";
import figmaReady from "./figma/92-2592.png";
import figmaCheck from "./figma/92-9352.png";
import figmaLocked from "./figma/93-2626.png";
import figmaReleased from "./figma/93-2688.png";
import figmaCalculator from "./figma/153-11869.png";
import { LockBar } from "./lock-bar.tsx";
import { LockCalculator } from "./lock-calculator.tsx";
import { LOCK_CHECK_STATUSES, LockCheck } from "./lock-check.tsx";
import { LockPopupFooter } from "./lock-popup-footer.tsx";
import { LockPopupHeader } from "./lock-popup-header.tsx";
import { LockPopupLocked } from "./lock-popup-locked.tsx";
import { LockPopupPair } from "./lock-popup-pair.tsx";
import { LockPopupReady } from "./lock-popup-ready.tsx";
import { LockPopupReleased } from "./lock-popup-released.tsx";
import { LockToast } from "./lock-toast.tsx";
import { LOCK_TOOLBAR_STATES, LockToolbarIcon } from "./lock-toolbar-icon.tsx";

export const title = "Üki Lock";
export const order = 60;

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
const frame = { headerTitle: "Üki Lock" } as const;

export default function LockGallery() {
  return (
    <div>
      <Pair name="Ext/Toolbar icon 89:2491" figma={figmaToolbar}>
        <div className="flex items-center gap-6 rounded-md bg-canvas p-6">
          {LOCK_TOOLBAR_STATES.map((state) => (
            <LockToolbarIcon key={state} state={state} label={`Üki Lock · ${state}`} />
          ))}
        </div>
      </Pair>

      <Pair name="Ext/Popup header 92:2533" figma={figmaHeader}>
        <div className="flex w-90 flex-col gap-2 bg-surface">
          <LockPopupHeader title="Üki Lock" badge="READY" badgeTone="brand" />
          <LockPopupHeader title="Üki Lock" badge="NOT PAIRED" badgeTone="neutral" />
          <LockPopupHeader title="Üki Lock" badge="LOCKED" badgeTone="ink" />
          <LockPopupHeader title="Üki Lock" badge="DONE" badgeTone="ok" />
        </div>
      </Pair>

      <Pair name="Ext/Popup footer 92:2546" figma={figmaFooter}>
        <div className="flex w-90 flex-col gap-2">
          <LockPopupFooter text="Üki app · connected" />
          <LockPopupFooter text="Open the Üki app" dotTone="warn" />
          <LockPopupFooter text="Show dot = false" showDot={false} />
        </div>
      </Pair>

      <Pair name="Ext/Check 92:9352" figma={figmaCheck}>
        <div className="flex w-82 flex-col">
          {LOCK_CHECK_STATUSES.map((status) => (
            <LockCheck
              key={status}
              status={status}
              title="Other tabs"
              detail="3 open. They close at the start."
            />
          ))}
        </div>
      </Pair>

      <Pair name="Ext/Popup · Pair 92:2552" figma={figmaPair}>
        <LockPopupPair
          {...frame}
          badge="NOT PAIRED"
          title="Pair with the Üki app"
          body="Both should show the same code."
          code="482 913"
          codeLabel="Pairing code"
          check={{ id: "app", status: "pass", title: "Üki app found", detail: "Windows 11 · Aliya S." }}
          action={{ label: "Pair", onClick: noop }}
          hint="Different code? Close this and restart the Üki app."
          footer="Üki app · found on this laptop"
        />
      </Pair>

      <Pair name="Ext/Popup · Ready 92:2592" figma={figmaReady}>
        <LockPopupReady
          {...frame}
          badge="READY"
          overline="NEXT EXAM"
          exam="Physics 1 · Quiz 3"
          examMeta="Starts 14:00 · 40 min · exam.kru.test"
          checks={[
            { id: "app", status: "pass", title: "Üki app", detail: "Connected · camera on" },
            {
              id: "tabs",
              status: "wait",
              title: "Other tabs",
              detail: "3 open. They close at the start and come back after you submit.",
            },
            { id: "ext", status: "pass", title: "Other extensions", detail: "2 paused until you submit" },
            { id: "share", status: "pass", title: "Screen sharing", detail: "Off" },
          ]}
          action={{ label: "Lock and start", onClick: noop }}
          note="Only the exam portal and the calculator stay open."
          footer="Üki app · connected · camera on"
        />
      </Pair>

      <Pair name="E.5b Calculator 153:11869" figma={figmaCalculator}>
        <LockCalculator
          expression="2 × 25 ÷ 2"
          value="25"
          clearLabel="C"
          note="Works offline. Keeps no history after you submit."
          onKey={noop}
        />
      </Pair>
      <Pair name="Ext/Popup · Locked 93:2626" figma={figmaLocked}>
        <LockPopupLocked
          {...frame}
          badge="LOCKED"
          time="17:42"
          timeMeta="left · ends 14:40"
          progress={0.55}
          progressLabel="Time used"
          allowedLabel="OPEN DURING THE EXAM"
          allowed={[
            { id: "portal", icon: "globe", label: "Exam portal", meta: "exam.kru.test" },
            { id: "calc", icon: "app-window", label: "Calculator", meta: "built in" },
          ]}
          notedLabel="NOTED · 3"
          noted={[
            { id: "1", time: "14:09:31", title: "New tab blocked", detail: "Ctrl+T pressed" },
            { id: "2", time: "14:16:05", title: "Copy blocked", detail: "Question 4" },
            { id: "3", time: "14:18:40", title: "Site closed", detail: "wikipedia.org" },
          ]}
          action={{ label: "Ask proctor", onClick: noop }}
          footer="Üki app · watching · camera on"
        />
      </Pair>

      <Pair name="Ext/Popup · Released 93:2688" figma={figmaReleased}>
        <LockPopupReleased
          {...frame}
          badge="DONE"
          title="Lock released"
          body="Submitted at 14:38. Your 3 tabs are back."
          facts={[
            { id: "for", label: "Locked for", value: "38 min" },
            { id: "blocked", label: "Blocked attempts", value: "3 · in your exam log" },
            { id: "sent", label: "Sent to the proctor", value: "Events only" },
          ]}
          action={{ label: "Close", onClick: noop }}
          footer="Üki app · idle"
        />
      </Pair>

      <Pair name="Ext/Toast 89:2492" figma={figmaToast}>
        <div className="rounded-md bg-canvas p-6">
          <LockToast message="Copy is off during the exam." time="14:16 · noted" />
        </div>
      </Pair>

      <div className="mb-12">
        <h3 className="type-ui-label mb-4">Ext/Lock bar 90:2549 · code, then Figma</h3>
        <LockBar
          badge="LOCKED"
          exam="Physics 1 · Quiz 3"
          tabs={[
            { id: "portal", icon: "globe", label: "Exam portal", active: true },
            { id: "calc", icon: "calculator", label: "Calculator", onSelect: noop },
          ]}
          watching="Üki watching"
          time="17:42"
          timeLabel="left"
          askProctorLabel="Ask proctor"
          onAskProctor={noop}
          toolbarIconLabel="Üki Lock · locked"
        />
        <img src={assetUrl(figmaBar)} alt="" className="mt-4 w-full" />
      </div>
    </div>
  );
}
