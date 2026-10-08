// The share link's token as report_shares stores it (create_share in the Phase 1 migration): the
// SHA-256 of the token's UTF-8 text in lower-case hex. Only this hash ever reaches the database from
// /r/[token]. Pure: Web Crypto only, so Vitest runs it under Node.

const encoder = new TextEncoder();

/** SHA-256 of `token` (its UTF-8 bytes), as 64 lower-case hex digits. */
export async function shareTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
