import type { RouteId } from "../router/routes.ts";

/**
 * Stands in for a portal page until the browser-exam work package builds it from the portal parts of
 * E.4 (quiz), E.5 (attempt) and E.9 (review). No copy yet: the portal strings come from those frames.
 */
export function PagePlaceholder({ route }: { route: RouteId }) {
  return (
    <main data-route={route} className="flex min-h-screen w-full flex-col gap-6 bg-canvas p-8">
      <div className="h-10 w-1/3 rounded-md bg-subtle" />
      <div className="h-64 rounded-card border border-line-default bg-surface" />
    </main>
  );
}
