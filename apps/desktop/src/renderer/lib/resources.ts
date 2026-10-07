// Files in apps/desktop/resources (models, wasm, language data) load through uki://app/resources/..., in
// development and in packaged builds alike, never from a CDN.
export { resourceUrl } from "../../shared/origin.ts";
