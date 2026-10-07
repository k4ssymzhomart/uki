import type { ElementType, ReactNode } from "react";

/** Props a link component receives from @uki/ui. Next.js `Link` and a plain "a" both accept them. */
export type LinkProps = {
  href: string;
  className?: string;
  children?: ReactNode;
  "aria-current"?: "page";
  "aria-label"?: string;
};

/** A link component such as Next.js `Link`; defaults to "a" wherever a component takes one. */
export type LinkComponent = ElementType<LinkProps>;
