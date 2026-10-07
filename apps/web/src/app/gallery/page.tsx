import { notFound } from "next/navigation";
import { GalleryView } from "./gallery-view.tsx";

/** Development only: every @uki/ui primitive in every state next to its Figma screenshot. */
export default function GalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GalleryView />;
}
