// Stand-in for next/image in jsdom tests: a plain <img> with the static import's URL.
import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  fill?: boolean;
  preload?: boolean;
  unoptimized?: boolean;
};

export default function Image({
  src,
  alt,
  fill: _fill,
  preload: _preload,
  unoptimized: _unoptimized,
  ...props
}: Props) {
  // biome-ignore lint/performance/noImgElement: a test stand-in for next/image itself.
  return <img src={typeof src === "string" ? src : src.src} alt={alt} {...props} />;
}
