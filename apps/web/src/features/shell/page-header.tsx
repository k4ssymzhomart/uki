"use client";

import { AppTopBar, Avatar } from "@uki/ui";
import type { ReactNode } from "react";
import { useStaff } from "./staff-context.ts";

/**
 * App/Top bar (Figma 47:2201) for a dashboard page: breadcrumb, title and the staff member's avatar.
 * Phase 0 leaves out the search field and the notifications button, which have nothing to show yet.
 */
export function PageHeader({ breadcrumb, title }: { breadcrumb?: ReactNode; title: ReactNode }) {
  const staff = useStaff();
  return (
    <AppTopBar
      breadcrumb={breadcrumb}
      title={title}
      className="sticky top-0 z-10"
      actions={<Avatar tone="ink" size="lg" initials={staff.initials} />}
    />
  );
}
