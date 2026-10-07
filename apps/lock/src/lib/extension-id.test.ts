// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extensionIdFromManifestKey, extensionIdFromPublicKey } from "./extension-id.ts";

describe("extension id", () => {
  it("maps the first 16 bytes of SHA-256 of the key to a to p", () => {
    // SHA-256 of an empty input starts e3b0c44298fc1c149afbf4c8996fb924: e->o, 3->d, b->l, 0->a, ...
    expect(extensionIdFromPublicKey(new Uint8Array())).toBe("odlameecjipmbmbejkplpemijjgpljce");
  });

  it("is 32 letters a to p and the same from the manifest key", () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const der = publicKey.export({ type: "spki", format: "der" });
    const id = extensionIdFromPublicKey(der);
    expect(id).toMatch(/^[a-p]{32}$/);
    expect(extensionIdFromManifestKey(der.toString("base64"))).toBe(id);
  });
});
