import { DropdownMenu } from "radix-ui";

/**
 * Dropdown menu root and trigger, straight from Radix. Compose:
 * <Menu><MenuTrigger asChild><IconButton … /></MenuTrigger><MenuContent>…</MenuContent></Menu>
 */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;
