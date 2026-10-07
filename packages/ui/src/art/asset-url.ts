/**
 * Vite, WXT and electron-vite import an SVG as a URL string; Next.js imports it as `{ src, width, height }`.
 * Art components accept either and render the URL.
 */
export type AssetModule = string | { readonly src: string };

export function assetUrl(asset: AssetModule): string {
  return typeof asset === "string" ? asset : asset.src;
}
