// Development gallery: every Feedback component in every variant and state, next to its Figma
// screenshot. Sample strings are the Figma defaults; this file is not product UI.
// Dialogs, toasts, tooltips and menus are drawn open and inline; the buttons open the real, modal ones.
import { type ReactNode, useState } from "react";
import { assetUrl } from "../art/asset-url.ts";
import { Button } from "../controls/button.tsx";
import { IconButton } from "../controls/icon-button.tsx";
import { TextArea } from "../controls/text-area.tsx";
import { Banner } from "./banner.tsx";
import { Dialog } from "./dialog.tsx";
import figmaMenuItem from "./figma/71-2207.png";
import figmaMenuHeader from "./figma/71-2208.png";
import figmaMenuSeparator from "./figma/71-2210.png";
import figmaTooltip from "./figma/79-2411.png";
import figmaDialog from "./figma/144-2725.png";
import figmaToast from "./figma/145-2732.png";
import figmaBanner from "./figma/145-2770.png";
import figmaSpinner from "./figma/145-2771.png";
import { Menu, MenuTrigger } from "./menu.ts";
import { MenuContent } from "./menu-content.tsx";
import { MenuItem } from "./menu-item.tsx";
import { MenuLabel } from "./menu-label.tsx";
import { MenuSeparator } from "./menu-separator.tsx";
import { Spinner } from "./spinner.tsx";
import { Toast } from "./toast.tsx";
import { useToast } from "./toast-context.ts";
import { ToastProvider } from "./toast-provider.tsx";
import { Tooltip } from "./tooltip.tsx";

export const title = "Feedback";
export const order = 2;

function Pair({ name, figma, children }: { name: string; figma: string; children: ReactNode }) {
  return (
    <div className="mb-12 grid grid-cols-2 items-start gap-8">
      <div>
        <h3 className="mb-4 type-ui-label">{name} · code</h3>
        {children}
      </div>
      <div>
        <h3 className="mb-4 type-ui-label">{name} · Figma</h3>
        <img src={assetUrl(figma)} alt="" className="max-w-full" />
      </div>
    </div>
  );
}

const INLINE = "static translate-x-0 translate-y-0";

function InlineDialogs() {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [field, setField] = useState<HTMLDivElement | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <div ref={setBox} className="flex flex-wrap items-start gap-6" />
      {box ? (
        <>
          <Dialog
            open
            modal={false}
            container={box}
            className={INLINE}
            title="Send the report?"
            body="The committee gets a read-only link that expires in 7 days."
            cancelLabel="Cancel"
            confirmLabel="Send link"
          />
          <Dialog
            open
            modal={false}
            container={box}
            className={INLINE}
            tone="danger"
            title="Send the report?"
            body="The committee gets a read-only link that expires in 7 days."
            cancelLabel="Cancel"
            confirmLabel="End session"
          />
        </>
      ) : null}
      <div ref={setField} />
      {field ? (
        <Dialog
          open
          modal={false}
          container={field}
          className={INLINE}
          tone="danger"
          title="End the session?"
          body="The student is told the session ended."
          cancelLabel="Cancel"
          confirmLabel="End session"
          confirmLoading
        >
          <TextArea label="Reason" helper="Goes into the report." />
        </Dialog>
      ) : null}
      <div className="flex gap-4">
        <Dialog
          trigger={<Button variant="secondary">Open dialog</Button>}
          title="Send the report?"
          body="The committee gets a read-only link that expires in 7 days."
          cancelLabel="Cancel"
          confirmLabel="Send link"
        />
        <Dialog
          trigger={<Button variant="danger">Open danger dialog</Button>}
          tone="danger"
          title="Send the report?"
          body="The committee gets a read-only link that expires in 7 days."
          cancelLabel="Cancel"
          confirmLabel="End session"
        >
          <TextArea label="Reason" helper="Goes into the report." />
        </Dialog>
      </div>
    </div>
  );
}

function ToastButtons() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        onClick={() =>
          toast.show({ kind: "success", message: "Report sent to the committee.", action: "Undo" })
        }
      >
        Success toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          const id = toast.show({ kind: "progress", message: "Report sent to the committee." });
          window.setTimeout(
            () => toast.show({ id, kind: "success", message: "Report sent to the committee." }),
            1500,
          );
        }}
      >
        Progress then success
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast.show({ kind: "error", message: "Report sent to the committee." })}
      >
        Error toast
      </Button>
    </div>
  );
}

function InlineToasts() {
  return (
    <ToastProvider
      label="Notifications"
      closeLabel="Close"
      viewportClassName="static left-auto bottom-auto translate-x-0 items-start px-0"
    >
      {(["success", "info", "error", "progress"] as const).map((kind) => (
        <Toast
          key={kind}
          open
          kind={kind}
          duration={Number.POSITIVE_INFINITY}
          message="Report sent to the committee."
          action="Undo"
          closeLabel="Close"
        />
      ))}
      <div className="mb-4">
        <ToastButtons />
      </div>
    </ToastProvider>
  );
}

function InlineMenu() {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div className="flex h-80 items-start gap-6">
      <Menu open modal={false}>
        <MenuTrigger asChild>
          <IconButton icon="more" label="Tile actions" />
        </MenuTrigger>
        {box ? (
          <MenuContent container={box} side="right" align="start">
            <MenuLabel>MADINA T. · SEAT 23</MenuLabel>
            <MenuItem icon="history" meta="T">
              Open timeline
            </MenuItem>
            <MenuItem icon="history" meta="T" className="bg-subtle">
              Open timeline
            </MenuItem>
            <MenuItem icon="history" meta="T" selected>
              Open timeline
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="history" meta="T" tone="danger">
              Open timeline
            </MenuItem>
            <MenuItem icon="history" meta="T" disabled>
              Open timeline
            </MenuItem>
          </MenuContent>
        ) : null}
      </Menu>
      <div ref={setBox} />
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary">Open menu</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>MADINA T. · SEAT 23</MenuLabel>
          <MenuItem icon="history" meta="T">
            Open timeline
          </MenuItem>
          <MenuItem icon="message" meta="M">
            Send a message
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon="stop" tone="danger">
            End session
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

export default function FeedbackGallery() {
  return (
    <div>
      <Pair name="Dialog 144:2725" figma={figmaDialog}>
        <InlineDialogs />
      </Pair>

      <Pair name="Toast 145:2732" figma={figmaToast}>
        <InlineToasts />
      </Pair>

      <Pair name="Banner 145:2770" figma={figmaBanner}>
        <div className="flex w-160 flex-col gap-4">
          <Banner
            kind="info"
            title="Lobby opens at 09:40"
            body="Students can join 20 minutes before the start."
            action={<Button variant="secondary">Open lobby</Button>}
          />
          <Banner
            kind="warn"
            title="Lobby opens at 09:40"
            body="Students can join 20 minutes before the start."
            action={<Button variant="secondary">Resend</Button>}
          />
          <Banner
            kind="error"
            title="Lobby opens at 09:40"
            body="Students can join 20 minutes before the start."
            action={<Button variant="secondary">Retry</Button>}
          />
          <Banner
            kind="offline"
            title="Lobby opens at 09:40"
            body="Students can join 20 minutes before the start."
          />
        </div>
      </Pair>

      <Pair name="Spinner 145:2771" figma={figmaSpinner}>
        <div className="flex items-center gap-6">
          <Spinner label="Loading" />
          <Spinner size="md" />
          <Spinner size="sm" />
          <span className="rounded-pill bg-inverse p-2 text-fg-inverse">
            <Spinner />
          </span>
        </div>
      </Pair>

      <Pair name="Tooltip 79:2411" figma={figmaTooltip}>
        <div className="flex h-36 items-center gap-24 pl-24">
          <Tooltip open content="Copy report link" shortcut="⌘ C">
            <IconButton icon="copy" label="Copy report link" />
          </Tooltip>
          <Tooltip open content="Copy report link" side="bottom">
            <IconButton icon="link" label="Copy report link" />
          </Tooltip>
          <Tooltip content="Hover or focus me" shortcut="⌘ C">
            <IconButton icon="help" label="Help" />
          </Tooltip>
        </div>
      </Pair>

      <Pair name="Menu item 71:2207 · Menu header 71:2208 · Menu separator 71:2210" figma={figmaMenuItem}>
        <InlineMenu />
        <div className="mt-4 flex flex-col gap-2">
          <img src={assetUrl(figmaMenuHeader)} alt="" className="w-62" />
          <img src={assetUrl(figmaMenuSeparator)} alt="" className="w-62" />
        </div>
      </Pair>
    </div>
  );
}
