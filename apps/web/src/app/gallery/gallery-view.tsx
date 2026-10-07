"use client";

import { Gallery } from "@uki/ui/gallery";

/** Client boundary: the gallery sections use state and Radix, so they render on the client. */
export function GalleryView() {
  return <Gallery />;
}
