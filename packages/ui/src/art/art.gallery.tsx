// Development gallery: every face, pose and logo next to the Figma screenshots of 4:123 and 3:24.
import type { ReactNode } from "react";
import { assetUrl } from "./asset-url.ts";
import { Face } from "./face.tsx";
import { FACE_STATES } from "./faces.ts";
import figmaMascot from "./figma/3-24.png";
import figmaFaces from "./figma/4-123.png";
import { Logo } from "./logo.tsx";
import { LOGO_VARIANTS, type LogoVariant } from "./logos.ts";
import { Mascot } from "./mascot.tsx";
import { MASCOT_POSES } from "./mascots.ts";

export const title = "Art";
export const order = 90;

function Pair({ name, figma, children }: { name: string; figma: string; children: ReactNode }) {
  return (
    <div className="mb-12 grid grid-cols-2 gap-8">
      <div>
        <h3 className="type-ui-label mb-4">{name} · code</h3>
        {children}
      </div>
      <div>
        <h3 className="type-ui-label mb-4">{name} · Figma</h3>
        <img src={assetUrl(figma)} alt="" className="w-full rounded-md" />
      </div>
    </div>
  );
}

const LOGO_BACKGROUND: Record<LogoVariant, string> = {
  "wordmark-ink": "bg-surface",
  "wordmark-paper": "bg-inverse",
  "wordmark-on-lime": "bg-brand",
  eyes: "bg-surface",
  "app-icon": "bg-surface",
};

export default function ArtGallery() {
  return (
    <div>
      <Pair name="Face 4:123" figma={figmaFaces}>
        <div className="grid grid-cols-6 gap-4 rounded-md bg-subtle p-4">
          {FACE_STATES.map((state) => (
            <figure key={state} className="flex flex-col items-center gap-1">
              <Face state={state} className="size-20" />
              <figcaption className="type-ui-mono">{state}</figcaption>
            </figure>
          ))}
        </div>
      </Pair>
      <Pair name="Mascot 3:24" figma={figmaMascot}>
        <div className="grid grid-cols-6 gap-4 rounded-md bg-subtle p-4">
          {MASCOT_POSES.map((pose) => (
            <figure key={pose} className="flex flex-col items-center gap-1">
              <Mascot pose={pose} className="size-20" />
              <figcaption className="type-ui-mono">{pose}</figcaption>
            </figure>
          ))}
        </div>
      </Pair>
      <div className="flex flex-wrap items-end gap-6">
        {LOGO_VARIANTS.map((variant) => (
          <figure key={variant} className="flex flex-col items-start gap-2">
            <div className={`rounded-md p-4 ${LOGO_BACKGROUND[variant]}`}>
              <Logo variant={variant} alt="Üki" className="h-16 w-auto" />
            </div>
            <figcaption className="type-ui-mono">{variant}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
