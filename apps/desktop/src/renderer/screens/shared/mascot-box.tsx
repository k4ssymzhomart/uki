import { cn, Mascot, type MascotPose } from "@uki/ui";

const BOX = {
  /** 150 px box (2.3, 2.1c, 2.1d): the pose sits 20 px in from the sides and 8 px above the bottom. */
  md: { box: "size-37.5", art: "inset-x-5 top-7 bottom-2" },
  /** 190 px box (3.1). */
  lg: { box: "size-47.5", art: "inset-x-5 top-9 bottom-2.25" },
} as const;

export type MascotBoxProps = { pose: MascotPose; size?: keyof typeof BOX; className?: string };

/**
 * The Figma Mascot instance (3:24): the pose drawn inside a square box with its feet on a ground line
 * 5 % above the bottom, so swapping poses keeps the bean's size. Decorative.
 */
export function MascotBox({ pose, size = "md", className }: MascotBoxProps) {
  const { box, art } = BOX[size];
  return (
    <div aria-hidden="true" className={cn("relative shrink-0", box, className)}>
      <div className={cn("absolute", art)}>
        <Mascot pose={pose} size={150} className="size-full object-contain object-bottom" />
      </div>
    </div>
  );
}
