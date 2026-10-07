import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

export type TableProps = ComponentProps<"table">;

/**
 * The table that holds Row/Exam, Row/Lobby or Row/Session rows. Put TableHeaderCell cells in a
 * <thead><tr className="bg-subtle"> and the rows in <tbody>; set aria-busy while TableSkeletonRow rows show.
 */
export function Table({ className, ...props }: TableProps) {
  return <table className={cn("w-full border-collapse text-left text-fg-primary", className)} {...props} />;
}
