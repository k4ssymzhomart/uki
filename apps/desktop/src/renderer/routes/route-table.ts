// What the window shows for its URL hash. The student window is the only route in production builds;
// development builds add the UI kit gallery (#/gallery) and the student screens gallery (#/screens).

export type RouteId = "student" | "gallery" | "screens";

/** The route for a location hash such as "#/screens?frame=2.1&locale=ru". */
export function routeOf(hash: string, galleries: boolean): RouteId {
  if (!galleries) return "student";
  const path = hash.replace(/^#/, "").split("?")[0] ?? "";
  if (path === "/gallery") return "gallery";
  if (path === "/screens") return "screens";
  return "student";
}
