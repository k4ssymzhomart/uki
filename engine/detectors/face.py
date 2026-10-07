"""Face, gaze, head pose and presence with MediaPipe FaceLandmarker.
Covers brief 2.2.

No training: a pretrained model plus geometry and per-student calibration.
Smoothing only applies at num_faces=1, so for stable gaze track one face;
extra faces are counted for the second-person rule.
"""
import math
import os
import urllib.request

import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

import config


def _ensure_model():
    path = config.FACE_MODEL
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f"[face] downloading {path} ...")
        urllib.request.urlretrieve(config.FACE_MODEL_URL, path)
    return path


class FaceDetector:
    def __init__(self, max_faces=2):
        opts = mp_vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=_ensure_model()),
            running_mode=mp_vision.RunningMode.VIDEO,
            num_faces=max_faces,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
        )
        self.landmarker = mp_vision.FaceLandmarker.create_from_options(opts)

    def process(self, frame_rgb, ts_ms):
        """Return {present, count, gaze, yaw, pitch}.

        gaze is one of: on_screen, down, left, right, up.
        """
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        res = self.landmarker.detect_for_video(mp_img, ts_ms)
        count = len(res.face_landmarks) if res.face_landmarks else 0
        if count == 0:
            return {"present": False, "count": 0, "gaze": "absent", "yaw": 0.0, "pitch": 0.0}

        yaw, pitch = self._head_pose(res.facial_transformation_matrixes[0])
        gaze = self._gaze(res.face_blendshapes[0], yaw, pitch)
        return {"present": True, "count": count, "gaze": gaze, "yaw": yaw, "pitch": pitch}

    @staticmethod
    def _head_pose(matrix):
        """Yaw / pitch in degrees from the 4x4 facial transformation matrix.
        Axis convention is approximate; per-student calibration sets the limits.
        """
        data = matrix.data if hasattr(matrix, "data") else matrix
        M = np.array(data, dtype=float).reshape(4, 4)
        R = M[:3, :3]
        yaw = math.degrees(math.atan2(R[0, 2], R[2, 2]))
        pitch = math.degrees(math.asin(max(-1.0, min(1.0, -R[1, 2]))))
        return yaw, pitch

    @staticmethod
    def _gaze(blendshapes, yaw, pitch):
        s = {b.category_name: b.score for b in blendshapes}
        down = (s.get("eyeLookDownLeft", 0) + s.get("eyeLookDownRight", 0)) / 2
        up = (s.get("eyeLookUpLeft", 0) + s.get("eyeLookUpRight", 0)) / 2
        left = (s.get("eyeLookOutLeft", 0) + s.get("eyeLookInRight", 0)) / 2
        right = (s.get("eyeLookInLeft", 0) + s.get("eyeLookOutRight", 0)) / 2
        # Combine eye direction with head pose. Thresholds are calibrated per student (TODO).
        if down > 0.5 or pitch < -15:
            return "down"
        if left > 0.5 or yaw < -20:
            return "left"
        if right > 0.5 or yaw > 20:
            return "right"
        if up > 0.5 or pitch > 15:
            return "up"
        return "on_screen"
