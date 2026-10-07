// The development galleries. In production builds `import.meta.env.DEV` is false, so both lazy imports
// are dropped from the bundle and the components are null.
import { lazy } from "react";

/** #/gallery: every @uki/ui primitive in every state. */
export const UiGallery = import.meta.env.DEV
  ? lazy(() => import("@uki/ui/gallery").then((module) => ({ default: module.Gallery })))
  : null;

/** #/screens: every student frame with its Figma fixture, in kk, ru and en. */
export const ScreensGallery = import.meta.env.DEV
  ? lazy(() => import("../screens/screens.gallery.tsx"))
  : null;
