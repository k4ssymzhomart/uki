"""Lockdown guard — the ONLY OS-specific part of Üki.

get_guard() returns the Windows backend (real) or the macOS dev shim (no-op).
The engine and shell call this interface and never know which OS they are on.
"""
import sys


class BaseGuard:
    def start_hotkey_block(self):
        pass

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


def get_guard(on_block=None):
    if sys.platform.startswith("win"):
        from .win import WinGuard
        return WinGuard(on_block=on_block)
    from .mac import MacGuard
    return MacGuard(on_block=on_block)
