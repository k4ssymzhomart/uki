import type { LucideProps } from "lucide-react";
import { cn } from "./cn.ts";
import { ICON_SIZE, ICON_STROKE, type IconName, icons } from "./icons.ts";

export type IconProps = Omit<LucideProps, "aria-label" | "aria-hidden" | "role"> & {
  /** One of the 93 Figma icon names. */
  name: IconName;
  /**
   * Accessible name. Without it the icon is decorative and hidden from assistive technology;
   * with it the icon is announced as an image.
   */
  label?: string;
};

/**
 * Renders a Figma icon through lucide-react at 24 px with a 2 px stroke, coloured by icon/primary.
 * Size it with a Tailwind size class (size-4.5 for 18 px); the stroke scales with it, as in Figma.
 */
export function Icon({
  name,
  label,
  size = ICON_SIZE,
  strokeWidth = ICON_STROKE,
  className,
  ...rest
}: IconProps) {
  const Glyph = icons[name];
  const labelled = label !== undefined && label !== "";
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      focusable="false"
      data-icon={name}
      className={cn("shrink-0 text-icon-primary", className)}
      {...(labelled ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...rest}
    />
  );
}
