/**
 * Electron puts the app name, "Üki", into the default user agent. Header values must be Latin-1, so
 * protocol.handle cannot build the Request for uki:// with it (TypeError: Cannot convert argument to a
 * ByteString). The app sends "Uki" instead: accents dropped, anything else outside printable ASCII removed.
 */
export function asciiUserAgent(userAgent: string): string {
  return userAgent
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}
