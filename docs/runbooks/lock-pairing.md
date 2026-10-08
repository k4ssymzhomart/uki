# Runbook: Üki Lock pairing, lock and the 10-minute quiet test

The hand checks for work package 0.8: Chrome on the MacBook, and Chrome and Edge on a Windows 11 lab PC. The
automated smoke (`pnpm --filter lock smoke`, last section) runs the same flow in Chrome for Testing on one
Mac, but it does not replace these checks.

## 1. Make the key pair (once per team)

The manifest's `key` fixes the extension id, and the app's socket accepts only the Origin
`chrome-extension://<that id>`. The private key stays outside the repository.

```sh
pnpm --filter lock make-key
```

It writes the private key to `~/.uki/uki-lock-key.pem` (`%USERPROFILE%\.uki\uki-lock-key.pem` on Windows;
`--out <file>` for another place, never inside the repository) and prints two lines. Put both into the
repository root's `.env` on every laptop that builds the extension or the app:

```sh
LOCK_DEV_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
VITE_LOCK_EXTENSION_ID=abcdefghijklmnopabcdefghijklmnop
```

Lost the `.env` lines? `pnpm --filter lock make-key --from ~/.uki/uki-lock-key.pem` prints them again. Copy
the `.pem` to the second laptop through a USB stick or AirDrop, not through git or chat.

## 2. Build the extension

```sh
pnpm --filter lock build      # .output/chrome-mv3 (Chrome, Yandex, Opera)
pnpm --filter lock zip        # .output/lock-0.0.0-chrome.zip and lock-0.0.0-edge.zip (+ .output/edge-mv3)
```

Check the key went in: `.output/chrome-mv3/manifest.json` has a `"key"` field. `pnpm dev` also builds the
extension in watch mode into `.output/chrome-mv3-dev`.

## 3. Load it unpacked

**Chrome (macOS and Windows)**

1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. **Load unpacked**, pick `apps/lock/.output/chrome-mv3`.
3. The card's **ID** must equal `VITE_LOCK_EXTENSION_ID`. If not, the build had no key: fix `.env`, rebuild,
   remove the extension and load it again.
4. Puzzle icon in the toolbar, then the pin next to Üki Lock, so the face stays in the toolbar.

**Edge (Windows)**

1. Open `edge://extensions`, switch on **Developer mode** (left column).
2. **Load unpacked**, pick `apps/lock/.output/edge-mv3` (after `pnpm --filter lock zip`) or `chrome-mv3`.
3. The ID must be the same as in Chrome: the key, not the browser, sets it.
4. Extensions button, then the eye icon next to Üki Lock to show it in the toolbar.

Branded Chrome ignores the `--load-extension` command-line flag since Chrome 137; the Load unpacked button
still works.

## 4. Start the app with the same id

`VITE_LOCK_EXTENSION_ID` is a build-time variable of the desktop app. Start it after `.env` has it:

```sh
pnpm dev                      # or: pnpm --filter desktop build && pnpm --filter desktop preview
```

The app's main process prints `[lock-relay] listening on 127.0.0.1:47801` (or 47802, 47803 when taken). A
development build without the id prints a loud warning and accepts any extension; a packaged build without it
refuses every connection.

## 5. Pair

1. With the app open, click the Üki Lock face in the toolbar. Within 2 seconds the popup changes from
   "Open the Üki app" (E.3 step 03) to **Pair with the Üki app** with a 6-digit code, "Üki app found" and
   the line "macOS · <student>" or "Windows · <student>" (the student appears after joining).
2. The app shows the same code on its pairing card. Codes last 2 minutes; a new popup asks for a new one.
3. Click **Pair**. The badge turns **READY**, the toolbar face gets the lime dot.
4. Quit and reopen the browser: the popup is READY again without a new code (the app remembers the
   install in `lock-pairing.json` in its user data folder; the Lock keeps its install id in
   `chrome.storage.local`). Removing the extension makes a new install id, which pairs again.
5. Origin check: on any web page, open the DevTools console and run
   `new WebSocket("ws://127.0.0.1:47801")`. It must fail (the server answers 403).

Record for each browser: OS, browser and version, extension id, time to pair, and the READY screenshot.

## 6. The 10-minute quiet test

From Chrome 116, WebSocket messages keep an extension's service worker alive; both sides ping every 5 s.

1. Pair as above. **Close every DevTools window of the extension** (an open service-worker inspector keeps
   the worker alive by itself and hides the result).
2. Leave the browser idle for 10 minutes: no clicks, no tab changes. Keep the laptop awake (macOS:
   `caffeinate -d` in a terminal; Windows: power plan "never sleep"). Do it once with the browser window in
   front and once minimised.
3. After 10 minutes, without touching the browser first, check the app: its Lock status stayed **paired**
   the whole time and its log has no "no answer to 3 pings" line.
4. Then open `chrome://serviceworker-internals` (`edge://serviceworker-internals`): the Üki Lock worker is
   **RUNNING**. Click the toolbar face: the popup shows READY at once, not "Open the Üki app".

Pass: paired before and after, no drop in between, on Chrome macOS, Chrome Windows and Edge Windows.

## 7. Lock and release (WP 0.8 "Done when")

Needs the local stack, `pnpm dev` (mock portal on http://localhost:5180) and the seeded browser exam
"Physics 1 · Quiz 3" (code `PHYS1-102-FRI`). Keep the dashboard's live wall open on another laptop.

1. Open a few tabs in two windows (one pinned). Join the exam in the app; once it reaches the lobby the popup
   shows **READY** with "Physics 1 · Quiz 3", "Starts … · 40 min · localhost:5180" and "N open".
2. Open http://localhost:5180/physics-1/quiz-3. **Start attempt** is off. Click the face, then
   **Lock and start**: the window goes full screen, every other tab closes, the dark Lock bar appears with
   the time left, and Start attempt turns on. The app hides its window.
3. Ctrl+T or Cmd+T: the new tab closes at once; the wall shows `tab.blocked`.
4. Type `wikipedia.org` in the address bar (move the pointer to the top edge in full screen): the block page
   (E.7) names the host and the time; the wall shows `site.closed`. **Back to the exam** returns.
5. Select question text and press Ctrl+C or Cmd+C, right-click, Ctrl+P or Cmd+P: nothing happens except the
   toast "Copy is off during the exam." (E.6, 2.5 s); the timeline gets `copy.blocked` at most once per kind
   every 10 s.
6. Press Esc to leave full screen: full screen comes back and `lock.fullscreen_exit` is logged (a flag from
   the third).
7. Switch to another app for more than 2 s: `tab.blocked` with no host, and the exam window comes back.
8. **Finish attempt**: the review page releases the lock. Full screen ends, the tabs come back in their
   windows and order (pinned tab pinned), and the popup opens on **Lock released** (E.9; if Chrome refuses
   to open it, click the face).
9. For an exam in the app ("Mathematics 2 · Midterm"): when 2.1 opens the browser keeps one tab showing
   only "This site is closed during the exam."; any address you type lands there too; submit brings the tabs
   back.

## 8. Automated smoke (one Mac, Chrome for Testing)

```sh
pnpm --filter lock build && pnpm --filter lms-mock build
pnpm --filter lock smoke                      # SMOKE_QUIET_S=600 for a 10-minute quiet run
```

It loads the built extension with Playwright, runs the app's relay from `apps/desktop/src/main/lock-relay.ts`
in Node, serves the mock portal on port 5181 and walks pairing, a browser exam (lock, new tab, blocked site,
copy, full screen exit, release at the done path with the tabs back) and an exam in the app. Screenshots go
to `$TMPDIR/uki-lock-smoke` (`SMOKE_SHOTS` to change). DevTools-protocol automation may keep the worker
alive on its own, so the quiet run there does not replace step 6.

## Troubleshooting

- **The popup stays on "Open the Üki app".** The app is not running, all three ports are taken
  (`lsof -i :47801-47803` on macOS, `netstat -ano | findstr 4780` on Windows), or the ids differ: the app
  logs `refused a connection from origin chrome-extension://…`. Compare that id with
  `VITE_LOCK_EXTENSION_ID` and rebuild the app after changing `.env`.
- **"Different code?"** Close the popup and restart the app; the next popup asks for a fresh code.
- **Edge reports another origin.** The relay also accepts `extension://<id>` for the same id; if Edge
  connects with neither, note the origin from the app log in `docs/decisions.md`.
- **Developer mode is greyed out** on a managed laptop: an administrator policy blocks unpacked extensions;
  use a personal browser profile on the MacBook, or ask lab IT on a lab PC.
