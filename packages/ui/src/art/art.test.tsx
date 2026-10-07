import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { assetUrl } from "./asset-url.ts";
import { Face } from "./face.tsx";
import { FACE_STATES, faceSrc, isFaceState } from "./faces.ts";
import { Logo } from "./logo.tsx";
import { LOGO_VARIANTS, logoSrc } from "./logos.ts";
import { Mascot } from "./mascot.tsx";
import { MASCOT_POSES, mascotSrc } from "./mascots.ts";

afterEach(cleanup);

describe("art sources", () => {
  it("has the 12 Figma face states, each with its own file", () => {
    expect(FACE_STATES).toHaveLength(12);
    const urls = FACE_STATES.map(faceSrc);
    expect(new Set(urls).size).toBe(12);
    // Vite inlines files under 4 KB as data URIs, so the faces may not carry their file names.
    for (const url of urls) expect(url).toMatch(/^data:image\/svg\+xml|uki-face-/);
  });

  it("has the 22 Figma mascot poses, each with its own file", () => {
    expect(MASCOT_POSES).toHaveLength(22);
    for (const pose of MASCOT_POSES) expect(mascotSrc(pose)).toContain(`uki-bean-${pose}`);
  });

  it("has the five logo variants", () => {
    expect(LOGO_VARIANTS).toHaveLength(5);
    const urls = LOGO_VARIANTS.map(logoSrc);
    // The kit's on-lime wordmark is the ink wordmark (ink is the only text colour on lime).
    expect(logoSrc("wordmark-on-lime")).toBe(logoSrc("wordmark-ink"));
    expect(new Set(urls).size).toBe(4);
    for (const url of urls) expect(url).toMatch(/^data:image\/svg\+xml|uki-/);
  });

  it("reads both Vite URL strings and Next.js static image objects", () => {
    expect(assetUrl("/a.svg")).toBe("/a.svg");
    expect(assetUrl({ src: "/_next/static/media/a.svg" })).toBe("/_next/static/media/a.svg");
  });

  it("recognises face states", () => {
    expect(isFaceState("look-left")).toBe(true);
    expect(isFaceState("angry")).toBe(false);
    expect(isFaceState(3)).toBe(false);
  });
});

describe("Face", () => {
  it("renders the state's SVG, decorative by default, at the Figma size", () => {
    const { container } = render(<Face state="flag" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(faceSrc("flag"));
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("width")).toBe("160");
    expect(img?.dataset.state).toBe("flag");
  });

  it("takes alt and size from props and keeps native props", () => {
    const { getByRole } = render(<Face state="happy" size={48} alt="Submitted" className="size-12" id="f" />);
    const img = getByRole("img", { name: "Submitted" });
    expect(img.getAttribute("width")).toBe("48");
    expect(img.id).toBe("f");
    expect(img.className).toContain("size-12");
  });
});

describe("Mascot and Logo", () => {
  it("renders a pose", () => {
    const { getByRole } = render(<Mascot pose="no-phone" alt="Phone found" />);
    expect(getByRole("img", { name: "Phone found" }).getAttribute("src")).toBe(mascotSrc("no-phone"));
  });

  it("renders a logo variant", () => {
    const { getByRole } = render(<Logo variant="wordmark-paper" alt="Üki" />);
    expect(getByRole("img", { name: "Üki" }).getAttribute("src")).toBe(logoSrc("wordmark-paper"));
  });
});
