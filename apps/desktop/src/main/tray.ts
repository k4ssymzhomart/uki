// Exams in the browser ("Window states" in docs/phase-0-plan.md): the window hides, a tray or menu bar
// icon shows the watch state, and detection keeps running. backgroundThrottling is off for the window
// (window.ts) and powerSaveBlocker "prevent-app-suspension" runs while hidden, so the camera and the
// detection worker keep full speed. The watch label follows the exam.state messages the renderer sends
// to Üki Lock: "Üki watching" (lock.watching) or "Phone found" (exam.phone.title).
import type { DesktopOs, WatchLabel } from "@uki/contracts";
import { createUkiTranslator, DEFAULT_LOCALE, type Locale } from "@uki/i18n";
import type { BrowserWindow, Menu, MenuItemConstructorOptions, PowerSaveBlocker, Tray } from "electron";
import { readRendererLocale, type ScriptRunner } from "./locale.ts";

export type TrayLabels = { watching: string; phoneFound: string; open: string };

/** The tray strings from the catalog: the watch labels and the Tray group's menu item. */
export function trayLabels(locale: Locale): TrayLabels {
  const t = createUkiTranslator(locale);
  return { watching: t("lock.watching"), phoneFound: t("exam.phone.title"), open: t("tray.open") };
}

export type TrayHandle = Pick<Tray, "setToolTip" | "setContextMenu" | "popUpContextMenu" | "on" | "destroy">;
export type TrayWindow = Pick<
  BrowserWindow,
  "hide" | "show" | "focus" | "isDestroyed" | "isMinimized" | "restore" | "on" | "removeListener"
> & { readonly webContents: ScriptRunner };

export type TrayModeOptions = {
  os: DesktopOs;
  /** Makes the tray icon: the menu bar template on macOS, the colour icon on Windows. */
  createTray: () => TrayHandle;
  buildMenu: (template: MenuItemConstructorOptions[]) => Menu;
  powerSaveBlocker: Pick<PowerSaveBlocker, "start" | "stop" | "isStarted">;
  labels?: (locale: Locale) => TrayLabels;
};

export interface TrayMode {
  /** True from exam.hideToTray(true) until exam.hideToTray(false). Quit is blocked meanwhile. */
  readonly active: boolean;
  set(on: boolean): Promise<void>;
  /** From the exam.state messages the renderer sends to the Lock. */
  setExamState(state: { watch: WatchLabel; locale: Locale }): void;
  /** While active, closing the window hides it instead (detection must keep running). */
  attach(window: TrayWindow): () => void;
  dispose(): void;
}

export function createTrayMode(options: TrayModeOptions): TrayMode {
  const labelsFor = options.labels ?? trayLabels;
  let active = false;
  let window: TrayWindow | null = null;
  let tray: TrayHandle | null = null;
  let blockerId: number | null = null;
  let watch: WatchLabel = "watching";
  let locale: Locale | null = null;

  const usableWindow = (): TrayWindow | null => (window && !window.isDestroyed() ? window : null);

  function showWindow(): void {
    const target = usableWindow();
    if (!target) return;
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
  }

  function render(): void {
    if (!tray) return;
    const labels = labelsFor(locale ?? DEFAULT_LOCALE);
    const state = watch === "phone_found" ? labels.phoneFound : labels.watching;
    tray.setToolTip(state);
    tray.setContextMenu(
      options.buildMenu([
        { label: state, enabled: false },
        { type: "separator" },
        { label: labels.open, click: showWindow },
      ]),
    );
  }

  function startBlocker(): void {
    if (blockerId !== null && options.powerSaveBlocker.isStarted(blockerId)) return;
    blockerId = options.powerSaveBlocker.start("prevent-app-suspension");
  }

  function stopBlocker(): void {
    if (blockerId !== null && options.powerSaveBlocker.isStarted(blockerId)) {
      options.powerSaveBlocker.stop(blockerId);
    }
    blockerId = null;
  }

  function removeTray(): void {
    tray?.destroy();
    tray = null;
  }

  async function set(on: boolean): Promise<void> {
    if (on) {
      active = true;
      const target = usableWindow();
      if (target) locale = await readRendererLocale(target.webContents);
      // exam.hideToTray(false) may have arrived while the locale was read.
      if (!active) return;
      if (!tray) {
        tray = options.createTray();
        // Windows opens the menu on right-click only; a left click opens it too.
        if (options.os === "windows") tray.on("click", () => tray?.popUpContextMenu());
      }
      render();
      startBlocker();
      target?.hide();
      return;
    }
    active = false;
    removeTray();
    stopBlocker();
    showWindow();
  }

  function attach(next: TrayWindow): () => void {
    window = next;
    const onClose = (event: { preventDefault(): void }) => {
      if (!active) return;
      event.preventDefault();
      next.hide();
    };
    next.on("close", onClose);
    return () => {
      next.removeListener("close", onClose);
      if (window === next) window = null;
    };
  }

  return {
    get active() {
      return active;
    },
    set,
    setExamState(state) {
      if (state.watch === watch && state.locale === locale) return;
      watch = state.watch;
      locale = state.locale;
      render();
    },
    attach,
    dispose() {
      active = false;
      removeTray();
      stopBlocker();
    },
  };
}
