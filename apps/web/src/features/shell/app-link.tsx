"use client";

import type { LinkProps } from "@uki/ui";
import type { Route } from "next";
import Link from "next/link";

/**
 * Next.js Link for @uki/ui's `linkAs` slots (sidebar, table rows). The kit passes plain strings; the
 * dashboard builds them from known routes, so they are cast to typed routes here.
 */
export function AppLink({ href, ...props }: LinkProps) {
  return <Link href={href as Route} {...props} />;
}
