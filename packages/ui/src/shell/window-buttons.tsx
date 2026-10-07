import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import { noDragRegion } from "./window-os.ts";

export type WindowButtonLabels = { minimize: string; maximize: string; close: string };

export type WindowButtonsProps = Omit<ComponentProps<"div">, "children"> & {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  /** Accessible names; required unless decorative. */
  labels?: WindowButtonLabels;
  /** Draw the buttons as a picture only (inside Browser/Top bar). */
  decorative?: boolean;
};

const BUTTON =
  "flex h-full w-11.5 shrink-0 items-center justify-center text-icon-primary outline-none enabled:cursor-pointer enabled:hover:bg-hover enabled:active:bg-pressed focus-visible:shadow-focus";

/**
 * Windows window buttons, 46 px wide and as tall as their bar (Figma App/Title bar OS=Windows, 150:13341).
 * A button without a handler is disabled, for example close during an exam.
 */
export function WindowButtons({
  onMinimize,
  onMaximize,
  onClose,
  labels,
  decorative = false,
  className,
  ...props
}: WindowButtonsProps) {
  const glyphs = [
    { key: "minimize", glyph: <Icon name="minus" className="size-4" />, onClick: onMinimize },
    { key: "maximize", glyph: <Icon name="square" className="size-3.25" />, onClick: onMaximize },
    { key: "close", glyph: <Icon name="close" className="size-4" />, onClick: onClose },
  ] as const;
  return (
    <div
      aria-hidden={decorative || undefined}
      className={cn("flex shrink-0 items-stretch self-stretch overflow-clip", noDragRegion, className)}
      {...props}
    >
      {glyphs.map(({ key, glyph, onClick }) =>
        decorative ? (
          <span key={key} className={BUTTON}>
            {glyph}
          </span>
        ) : (
          <button
            key={key}
            type="button"
            aria-label={labels?.[key]}
            disabled={onClick === undefined}
            onClick={onClick}
            className={BUTTON}
          >
            {glyph}
          </button>
        ),
      )}
    </div>
  );
}
