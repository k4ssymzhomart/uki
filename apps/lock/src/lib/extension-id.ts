// Chromium derives an extension's id from its public key: the first 128 bits of SHA-256 over the
// DER-encoded SubjectPublicKeyInfo, written with the letters a to p instead of hex digits. A fixed `key` in
// the manifest therefore gives a fixed id, which the app's socket checks as the Origin.
import { createHash } from "node:crypto";

export function extensionIdFromPublicKey(spkiDer: Uint8Array): string {
  const hex = createHash("sha256").update(spkiDer).digest("hex").slice(0, 32);
  return [...hex]
    .map((digit) => String.fromCharCode("a".charCodeAt(0) + Number.parseInt(digit, 16)))
    .join("");
}

/** The manifest's `key`: the DER public key in base64. */
export function extensionIdFromManifestKey(key: string): string {
  return extensionIdFromPublicKey(Buffer.from(key.trim(), "base64"));
}
