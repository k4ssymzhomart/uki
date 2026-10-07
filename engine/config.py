"""Üki engine configuration — thresholds, model paths, networking.
Every number is a starting point; tune on your own recordings (Phase 5).
"""

# --- Networking ---
WS_HOST = "localhost"
WS_PORT = 8765
# If set, e.g. "ws://192.168.1.50:8000/ingest", the engine also forwards
# status/events to the proctor console over the LAN. (Wiring: TODO)
PROCTOR_URL = None

SESSION_ID = "seat-14"        # one per student PC; set per lab machine

# --- Camera / loop ---
CAMERA_INDEX = 0
TARGET_FPS = 15               # analysed frames per second
YOLO_EVERY = 2               # run YOLO on every Nth frame (face runs every frame)
STATUS_HZ = 2                # status broadcasts per second

# --- Models ---
YOLO_MODEL = "yolo11n.pt"     # ultralytics auto-downloads on first run
FACE_MODEL = "models/face_landmarker.task"
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# COCO class ids we keep (id: name)
COCO_KEEP = {0: "person", 67: "cell phone", 73: "book", 63: "laptop", 62: "tv"}

# --- Detection thresholds ---
PHONE_CONF = 0.35
PHONE_MIN_AREA = 0.01         # ignore boxes smaller than 1% of the frame
PHONE_VOTE = (3, 5)          # fire if phone seen in 3 of the last 5 frames

GAZE_DOWN_SECONDS = 4.0       # look down with no keyboard/mouse input
GAZE_SIDE_SECONDS = 2.0
ABSENT_SECONDS = 3.0
SECOND_PERSON_VOTE = (4, 8)
CAMERA_BLOCKED_SECONDS = 5.0

# photo attempt: phone high in the frame (near face height) and held steady
PHOTO_FACE_HEIGHT = 0.5       # phone box centre above this fraction from the top
PHOTO_STEADY_SECONDS = 0.5

# --- Risk score (0..100) ---
RISK_WEIGHTS = {
    "phone_in_frame": 25, "photo_attempt": 40, "gaze_down": 8, "gaze_side": 8,
    "absent": 10, "second_person": 30, "camera_blocked": 20, "focus_lost": 20,
    "forbidden_app": 25, "overlay": 40, "remote_or_vm": 50, "hotkey": 2,
}
RISK_DECAY_PER_SEC = 1.5      # points bled off per second
RISK_YELLOW = 30
RISK_RED = 60
