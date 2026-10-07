import { describe, expect, it } from "vitest";
import { cameraCardRect } from "../flow/select.ts";
import { cardGeometry, coverSource } from "./synthetic-geometry.ts";

describe("coverSource", () => {
  it("crops a square portrait to the 4:3 picture, centred", () => {
    const crop = coverSource({ width: 500, height: 500 }, { width: 640, height: 480 });
    expect(crop.width).toBeCloseTo(500);
    expect(crop.height).toBeCloseTo(375);
    expect(crop.x).toBeCloseTo(0);
    expect(crop.y).toBeCloseTo(62.5);
  });

  it("crops a wide picture at the sides", () => {
    const crop = coverSource({ width: 1600, height: 900 }, { width: 640, height: 480 });
    expect(crop.height).toBeCloseTo(900);
    expect(crop.width).toBeCloseTo(1200);
    expect(crop.x).toBeCloseTo(200);
  });
});

describe("cardGeometry", () => {
  const picture = { width: 640, height: 480 };
  const geometry = cardGeometry(cameraCardRect(), picture);

  it("fills the identity check's card frame", () => {
    const rect = cameraCardRect();
    expect(geometry.card.x).toBe(Math.round(rect.x * 640));
    expect(geometry.card.width).toBe(Math.round(rect.width * 640));
    expect(geometry.card.y).toBe(Math.round(rect.y * 480));
  });

  it("keeps the photo and the eight digits inside the card", () => {
    const { card, photo, digits } = geometry;
    expect(photo.x).toBeGreaterThan(card.x);
    expect(photo.y + photo.height).toBeLessThanOrEqual(card.y + card.height);
    expect(digits.x).toBeGreaterThan(photo.x + photo.width);
    expect(digits.x + digits.maxWidth).toBeLessThanOrEqual(card.x + card.width);
    expect(digits.fontPx * 0.58 * 8).toBeLessThanOrEqual(digits.maxWidth);
    expect(digits.fontPx).toBeGreaterThanOrEqual(14);
  });

  it("leaves the face of the student outside the card", () => {
    // The portrait's face is drawn at the centre of the picture; its centre must not fall in the
    // card, or the identity check would read it as the card photo.
    const faceCentre = { x: 320 + 0.07 * 640, y: 190 };
    const { card } = geometry;
    const inside =
      faceCentre.x >= card.x &&
      faceCentre.x <= card.x + card.width &&
      faceCentre.y >= card.y &&
      faceCentre.y <= card.y + card.height;
    expect(inside).toBe(false);
  });
});
