import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const UKI_TYPE = [
  "display-xl",
  "display-l",
  "display-m",
  "h1",
  "h2",
  "h3",
  "body-l",
  "body-m",
  "body-s",
  "label-m",
  "label-m-strong",
  "card-title",
  "card-caption",
  "ui-title",
  "ui-label",
  "ui-caption",
  "ui-mono",
  "mono-m",
  "mono-s",
  "mono-overline",
  "mono-tag",
  "mono-display-l",
  "mono-display-m",
  "mono-code",
];

const twMerge = extendTailwindMerge<"uki-type">({
  extend: { classGroups: { "uki-type": [{ type: UKI_TYPE }] } },
});

/** Joins class names and lets later Tailwind classes win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
