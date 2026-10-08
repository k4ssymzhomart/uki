import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoLiveFixture } from "./demo-live-fixture.tsx";

/**
 * Development only: the DEMO-LIVE live wall (2.4) with the judge mode's simulator indicator, on fixture
 * data and a client that talks to nothing, for the evidence screenshots (docs/phase-1-exit.md, Judge
 * mode). `?stopped=1` shows the indicator stopped. The language follows the uki_locale cookie.
 */
export default function DemoLiveGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <DemoLiveFixture />
    </Suspense>
  );
}
