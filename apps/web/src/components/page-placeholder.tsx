import { Logo } from "@uki/ui/art/logo.tsx";

/**
 * Stands in for a screen until its work package builds it from Figma: the wordmark only, so no copy is
 * invented. `data-placeholder` names the frame for tests and the smoke check.
 */
export function PagePlaceholder({ frame }: { frame: string }) {
  return (
    <main data-placeholder={frame} className="flex min-h-screen items-center justify-center bg-canvas p-8">
      <Logo variant="wordmark-ink" className="h-8 w-auto" />
    </main>
  );
}
