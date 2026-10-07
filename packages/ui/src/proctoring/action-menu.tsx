import { Fragment, type KeyboardEvent, type ReactElement, type ReactNode, useState } from "react";
import { Menu, MenuTrigger } from "../feedback/menu.ts";
import { MenuContent } from "../feedback/menu-content.tsx";
import { MenuItem, type MenuItemTone } from "../feedback/menu-item.tsx";
import { MenuLabel } from "../feedback/menu-label.tsx";
import { MenuSeparator } from "../feedback/menu-separator.tsx";
import { type IconName, icons } from "../icons.ts";

export interface MenuAction {
  id: string;
  icon: IconName;
  label: ReactNode;
  /**
   * One key, shown at the end of the row (Figma meta) and pressed to choose the action while the menu
   * is open: "T", "M", "1".
   */
  shortcut?: string;
  /** danger for End session. */
  tone?: MenuItemTone;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ActionMenuProps {
  /** The element that opens the menu: a StudentTile, a Button or an IconButton. */
  trigger: ReactElement;
  /** Menu header (Mono/Tag), for example "MADINA T. · 20231187". */
  header?: ReactNode;
  /** Groups of actions; a separator sits between groups. */
  groups: readonly (readonly MenuAction[])[];
  /** A muted line under the last group, for example "Each student reads it in their language." */
  note?: ReactNode;
  noteIcon?: IconName;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Radix modal: true (default) blocks the page behind the open menu. */
  modal?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Portal target; pass a node inside the dark live wall to keep its theme. */
  container?: HTMLElement | null;
  /** Classes of the menu panel, for example its width. */
  className?: string;
}

/** Finds the enabled action whose shortcut matches a plain key press. */
export function findShortcut(
  groups: readonly (readonly MenuAction[])[],
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">,
): MenuAction | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1) return undefined;
  const key = event.key.toLowerCase();
  for (const group of groups) {
    for (const action of group) {
      if (!action.disabled && action.shortcut?.toLowerCase() === key) return action;
    }
  }
  return undefined;
}

/**
 * A dropdown of grouped actions built from the feedback Menu pieces, with one-key shortcuts.
 * Menu/Tile actions and Menu/Quick message are this menu with their own content.
 */
export function ActionMenu({
  trigger,
  header,
  groups,
  note,
  noteIcon = "globe",
  open,
  defaultOpen = false,
  onOpenChange,
  modal = true,
  side = "bottom",
  align = "start",
  container,
  className,
}: ActionMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const NoteIcon = icons[noteIcon];

  return (
    <Menu open={isOpen} onOpenChange={setOpen} modal={modal}>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent
        side={side}
        align={align}
        container={container}
        className={className}
        onKeyDown={(event) => {
          const action = findShortcut(groups, event);
          if (!action) return;
          event.preventDefault();
          setOpen(false);
          action.onSelect();
        }}
      >
        {header ? <MenuLabel>{header}</MenuLabel> : null}
        {groups.map((group, index) => (
          <Fragment key={group.map((action) => action.id).join(" ")}>
            {index > 0 ? <MenuSeparator /> : null}
            {group.map((action) => (
              <MenuItem
                key={action.id}
                icon={action.icon}
                meta={action.shortcut}
                tone={action.tone}
                disabled={action.disabled}
                aria-keyshortcuts={action.shortcut}
                onSelect={action.onSelect}
              >
                {action.label}
              </MenuItem>
            ))}
          </Fragment>
        ))}
        {note ? (
          <div className="flex items-center gap-2 overflow-hidden px-2.5 py-1.5">
            <NoteIcon aria-hidden="true" className="size-3.5 shrink-0 text-icon-primary" />
            <p className="type-ui-caption min-w-0 flex-1 opacity-58">{note}</p>
          </div>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
