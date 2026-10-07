import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";

export type SidebarNoteProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  icon?: IconName;
  /** "On device". */
  title: ReactNode;
  /** "Video never leaves student laptops. Only events and flagged frames travel." */
  body: ReactNode;
};

/** The privacy note above the user in App/Sidebar (Figma 47:2184); App/Sidebar hides it in the icon rail. */
export function SidebarNote({ icon = "lock", title, body, className, ...props }: SidebarNoteProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-start gap-1 overflow-clip rounded-md bg-brand-subtle px-3.5 pt-3 pb-3.5 text-fg-primary",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 overflow-clip">
        <Icon name={icon} className="size-4" />
        <p className="whitespace-nowrap type-ui-label">{title}</p>
      </div>
      <p className="type-ui-caption">{body}</p>
    </div>
  );
}
