// Geometry for the synthetic camera (synthetic-camera.ts): pure, so it is unit-tested without a canvas.

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The student's face in the brand kit's evidence portrait (uki-evidence-normal.jpg), as shares. */
export const FACE_IN_PORTRAIT: Rect = { x: 0.4, y: 0.2, width: 0.34, height: 0.43 };

/** Digits on the card: an 8-digit student number. */
const DIGITS = 8;
/** Width of one digit as a share of the font size (Helvetica and Arial bold digits are about 0.56). */
const DIGIT_WIDTH = 0.58;

/** The part of an image that fills `target` like object-fit: cover (centred). */
export function coverSource(image: Size, target: Size): Rect {
  const scale = Math.max(target.width / image.width, target.height / image.height);
  const width = target.width / scale;
  const height = target.height / scale;
  return { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height };
}

export interface CardGeometry {
  /** The card in picture pixels. */
  card: Rect;
  /** The photo on the card. */
  photo: Rect;
  /** Where the number goes: left edge, vertical middle, the font size and the room it has. */
  digits: { x: number; y: number; fontPx: number; maxWidth: number };
}

/** A student card filling the card frame (`rect` in shares of the picture): photo left, number right. */
export function cardGeometry(rect: Rect, picture: Size): CardGeometry {
  const card = {
    x: Math.round(rect.x * picture.width),
    y: Math.round(rect.y * picture.height),
    width: Math.round(rect.width * picture.width),
    height: Math.round(rect.height * picture.height),
  };
  const pad = Math.max(4, Math.round(card.height * 0.08));
  const photoHeight = card.height - 2 * pad;
  const photo = {
    x: card.x + pad,
    y: card.y + pad,
    width: Math.round(photoHeight * (FACE_IN_PORTRAIT.width / FACE_IN_PORTRAIT.height)),
    height: photoHeight,
  };
  const left = photo.x + photo.width + pad;
  const maxWidth = card.x + card.width - pad - left;
  const fontPx = Math.max(8, Math.floor(Math.min(card.height * 0.22, maxWidth / (DIGITS * DIGIT_WIDTH))));
  return { card, photo, digits: { x: left, y: card.y + card.height / 2, fontPx, maxWidth } };
}
