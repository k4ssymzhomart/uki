// The live camera preview for 1.2, 1.3 and 2.1 to 2.3: the flow's own stream in a muted <video>,
// mirrored like a selfie view. Nothing records it and it never leaves the laptop. Pass it to
// <StudentScreen camera={<CameraPreview />} cameraMirrored />.
import { useEffect, useRef } from "react";
import { useCameraStream } from "../flow/provider.tsx";

/** True: the preview is drawn mirrored, so screens flip the 1.3 card frame with it. */
export const CAMERA_PREVIEW_MIRRORED = true;

export function CameraPreview() {
  const stream = useCameraStream();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => {});
  }, [stream]);

  if (!stream) return null;
  return (
    <video
      ref={video}
      muted
      autoPlay
      playsInline
      disablePictureInPicture
      className="h-full w-full -scale-x-100 object-cover"
    />
  );
}
