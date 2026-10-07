import { createContext, use } from "react";

/**
 * How the dashboard sidebar draws. "responsive" is the plan's web layout: an icon rail of 72 px from
 * 1024 to 1279 px and the full 256 px sidebar at 1280 px and up (Tailwind's xl breakpoint).
 */
export type SidebarLayout = "full" | "rail" | "responsive";

export const SidebarLayoutContext = createContext<SidebarLayout>("full");

/** The layout of the surrounding AppSidebar, unless the component sets its own. */
export function useSidebarLayout(override?: SidebarLayout): SidebarLayout {
  const inherited = use(SidebarLayoutContext);
  return override ?? inherited;
}

type RailClasses = {
  /** Hidden while the sidebar is a rail. */
  hide: string;
  /** Visually hidden but still read while the sidebar is a rail. */
  srOnly: string;
  /** Shown only while the sidebar is a rail. */
  railOnly: string;
};

/** Static class names per layout, so Tailwind sees every one of them. */
export const railClasses: Record<SidebarLayout, RailClasses> = {
  full: { hide: "", srOnly: "", railOnly: "hidden" },
  rail: { hide: "hidden", srOnly: "sr-only", railOnly: "" },
  responsive: { hide: "max-xl:hidden", srOnly: "max-xl:sr-only", railOnly: "xl:hidden" },
};
