"""macOS dev shim. Üki ships on Windows; this lets the engine and shell run on a
MacBook while building. The lockdown is a NO-OP here and says so.

TODO (optional, for Mac demos): a CGEventTap could block Cmd+Tab / Cmd+Q.
"""


class MacGuard:
    def __init__(self, on_block=None):
        self.on_block = on_block

    def start_hotkey_block(self):
        print("[guard] macOS dev shim: hotkey lockdown DISABLED (Üki ships on Windows)")

    def stop_hotkey_block(self):
        pass

    def scan_forbidden(self):
        return []

    def is_remote_session(self):
        return False

    def list_virtual_cameras(self):
        return []

    def find_overlays(self):
        return []
