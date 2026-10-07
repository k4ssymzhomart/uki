"""Windows lockdown guard. Covers brief 2.3.

Blocks escape hotkeys with a low-level keyboard hook, watches for forbidden
processes, and reports remote-session signals.

Notes:
- The hook runs on its own thread with its own message loop, and the callback
  does almost nothing: Windows silently removes a low-level hook whose callback
  is slower than LowLevelHooksTimeout (max 1000 ms).
- Win+L and Win+G cannot be blocked here; close them with a lab Group Policy
  pack (DisableLockWorkstation, GameDVR AppCaptureEnabled). See docs/ (TODO).
- Run elevated in labs so the hook also covers admin windows and psutil can
  close processes.
"""
import ctypes
import ctypes.wintypes as wt
import threading

import psutil

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

WH_KEYBOARD_LL = 13
WM_KEYDOWN, WM_SYSKEYDOWN, WM_QUIT = 0x0100, 0x0104, 0x0012
HC_ACTION = 0

VK_TAB, VK_ESCAPE = 0x09, 0x1B
VK_LWIN, VK_RWIN = 0x5B, 0x5C
VK_SNAPSHOT = 0x2C
VK_C, VK_V = 0x43, 0x56
VK_LCONTROL, VK_RCONTROL = 0xA2, 0xA3
LLKHF_ALTDOWN = 0x20

FORBIDDEN = {
    "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe",
    "telegram.exe", "whatsapp.exe", "discord.exe", "zoom.exe",
    "anydesk.exe", "teamviewer.exe", "rustdesk.exe", "parsec.exe",
    "obs64.exe", "obs32.exe", "manycam.exe",
}


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [("vkCode", wt.DWORD), ("scanCode", wt.DWORD),
                ("flags", wt.DWORD), ("time", wt.DWORD),
                ("dwExtraInfo", ctypes.POINTER(wt.ULONG))]


HOOKPROC = ctypes.CFUNCTYPE(wt.LPARAM, ctypes.c_int, wt.WPARAM, wt.LPARAM)


def _ctrl_down():
    return (user32.GetAsyncKeyState(VK_LCONTROL) & 0x8000) or \
           (user32.GetAsyncKeyState(VK_RCONTROL) & 0x8000)


def _blocked(vk, alt):
    if vk in (VK_LWIN, VK_RWIN, VK_SNAPSHOT):
        return True
    if alt and vk in (VK_TAB, VK_ESCAPE):          # Alt+Tab, Alt+Esc
        return True
    if _ctrl_down() and vk == VK_ESCAPE:           # Ctrl+Esc (Start menu)
        return True
    if _ctrl_down() and vk in (VK_C, VK_V):        # copy / paste
        return True
    return False


class WinGuard:
    def __init__(self, on_block=None):
        self.on_block = on_block     # callback(vk) -> log a "hotkey" event
        self._hook = None
        self._thread = None
        self._tid = None
        self._proc = None

    def start_hotkey_block(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        self._tid = kernel32.GetCurrentThreadId()

        @HOOKPROC
        def proc(nCode, wParam, lParam):
            if nCode == HC_ACTION and wParam in (WM_KEYDOWN, WM_SYSKEYDOWN):
                kb = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                if _blocked(kb.vkCode, bool(kb.flags & LLKHF_ALTDOWN)):
                    if self.on_block:
                        try:
                            self.on_block(kb.vkCode)
                        except Exception:
                            pass
                    return 1   # swallow the key
            return user32.CallNextHookEx(None, nCode, wParam, lParam)

        self._proc = proc   # keep a reference or ctypes will GC it
        self._hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, proc, None, 0)
        msg = wt.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))

    def stop_hotkey_block(self):
        if self._hook:
            user32.UnhookWindowsHookEx(self._hook)
            self._hook = None
        if self._tid:
            user32.PostThreadMessageW(self._tid, WM_QUIT, 0, 0)

    def scan_forbidden(self):
        hits = []
        for p in psutil.process_iter(["name"]):
            n = (p.info.get("name") or "").lower()
            if n in FORBIDDEN:
                hits.append(n)
        return hits

    def is_remote_session(self):
        SM_REMOTESESSION = 0x1000
        return bool(user32.GetSystemMetrics(SM_REMOTESESSION))

    def list_virtual_cameras(self):
        # TODO: enumerate capture devices, match known virtual-cam names (OBS, ManyCam, DroidCam)
        return []

    def find_overlays(self):
        # TODO: EnumWindows + GetWindowDisplayAffinity == WDA_EXCLUDEFROMCAPTURE (0x11)
        return []
