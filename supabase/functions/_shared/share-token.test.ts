import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ShareTokenHash } from "./contracts/index.ts";
import { shareTokenHash } from "./share-token.ts";

describe("shareTokenHash", () => {
  it("is the lower-case hex SHA-256 of the token's UTF-8 text, as create_share stores it", async () => {
    const token = randomBytes(32).toString("base64url");
    const hash = await shareTokenHash(token);
    expect(hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(ShareTokenHash.safeParse(hash).success).toBe(true);
  });

  it("matches a known vector", async () => {
    expect(await shareTokenHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
