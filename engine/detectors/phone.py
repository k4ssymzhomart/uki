"""Phone / object detection with YOLO11n (COCO weights). Covers brief 2.1.

No training needed to qualify: COCO already has cell phone, person, book,
laptop and tv. TODO (Edge): fine-tune on our own phone-in-hand clips to lift
recall, then point config.YOLO_MODEL at the new weights.
"""
from ultralytics import YOLO

import config


class PhoneDetector:
    def __init__(self):
        self.model = YOLO(config.YOLO_MODEL)   # auto-downloads on first run

    def detect(self, frame):
        """Return detections for the classes we keep.

        Each item: {name, conf, box:(x1,y1,x2,y2), area_frac, cx, cy_frac}.
        cy_frac is 0 at the top of the frame, 1 at the bottom.
        """
        h, w = frame.shape[:2]
        out = []
        res = self.model.predict(frame, verbose=False, conf=config.PHONE_CONF)[0]
        for b in res.boxes:
            cls = int(b.cls[0])
            if cls not in config.COCO_KEEP:
                continue
            x1, y1, x2, y2 = (float(v) for v in b.xyxy[0])
            out.append({
                "name": config.COCO_KEEP[cls],
                "conf": float(b.conf[0]),
                "box": (x1, y1, x2, y2),
                "area_frac": ((x2 - x1) * (y2 - y1)) / (w * h),
                "cx": (x1 + x2) / 2 / w,
                "cy_frac": (y1 + y2) / 2 / h,
            })
        return out
