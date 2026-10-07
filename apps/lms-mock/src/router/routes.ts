// The three portal pages built from the portal parts of E.4, E.5 and E.9 ("Mock exam portal" in
// docs/phase-0-plan.md). The review path is the seed's lms_done_path: reaching it releases Üki Lock.

export const ROUTES = {
  quiz: "/physics-1/quiz-3",
  attempt: "/physics-1/quiz-3/attempt",
  review: "/physics-1/quiz-3/review",
} as const;

export type RouteId = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteId];

/** The page the root and unknown paths go to. */
export const HOME: RoutePath = ROUTES.quiz;

/** The route for a pathname, ignoring a trailing slash; null when no page matches. */
export function matchRoute(pathname: string): RouteId | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const [id, path] of Object.entries(ROUTES) as Array<[RouteId, RoutePath]>) {
    if (path === clean) return id;
  }
  return null;
}
