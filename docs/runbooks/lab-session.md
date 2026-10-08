# Runbook: the lab session and the Demo Day student machine

This runbook replaces `demo-laptops.md` (work package 0.13). It has the steps for the lab session on a Windows 11 lab PC (work package 0.14, P.5), with the lab checklist from `docs/phase-0-plan.md` (Testing), and the steps for the MacBook, the fallback student machine on Demo Day. Every Windows-only behaviour has a test in the CI Windows job and a line in the checklist below.

The hardware (`docs/phase-0-plan.md`, Decisions and Demo script):

- **MacBook Pro.** Used for development, and as the student machine on Demo Day if no Windows machine is allowed.
- **Windows 11 lab PCs at KRU.** Tested in short lab sessions.
- **GitHub's Windows runners.** They make the Windows builds.

On Demo Day the student machine is a KRU lab PC if the organizers allow it, otherwise the MacBook with its lockdown guard. The dashboard opens in a browser on the other screen. Madina Tulegenova (20231187) writes Mathematics 2 in the Üki app, and Aliya Seitkali (20231455) writes Physics 1 in the browser with Üki Lock. Everything uses the cloud project in Frankfurt.

A virtual machine on the MacBook cannot stand in for a lab PC: macOS takes the keys before the VM sees them.

## 1. Get the builds

The shipped Windows builds and Üki Lock come from the **latest GitHub release**, made by `.github/workflows/desktop-dist.yml` against the cloud project (WP 0.15). Each file has a stable address that always serves the newest release:

| File | Address | What it is |
| --- | --- | --- |
| `Uki-win-x64.zip` | https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-win-x64.zip | The shipped app, unpacked. It runs from any folder or the USB drive with no install |
| `Uki-Setup-win-x64.exe` | https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-Setup-win-x64.exe | The NSIS installer. Its install-mode page offers the current user only |
| `Uki-Lock-chrome.zip` | https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-Lock-chrome.zip | Üki Lock for Chrome |
| `Uki-Lock-edge.zip` | https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-Lock-edge.zip | Üki Lock for Edge |
| `Uki-mac-arm64.dmg`, `Uki-mac-x64.dmg` | https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-mac-arm64.dmg (and `Uki-mac-x64.dmg`) | Üki for Apple silicon and Intel Macs |

The release's Lock and app belong together: the Lock's key fixes its extension id, and the app accepts only that id, so take both from the same release. The release page lists each file's size and SHA-256 and the first-launch steps for unsigned builds. From the MacBook:

```sh
gh release download --repo k4ssymzhomart/uki -p 'Uki-win-x64.zip' -p 'Uki-Setup-win-x64.exe' -p 'Uki-Lock-*.zip' -D lab-usb
```

To publish a new release from `main` (about 10 minutes; the version is `0.1.<run number>`):

```sh
gh workflow run desktop-dist.yml --repo k4ssymzhomart/uki --ref main -f publish=true
```

**The lab zip is never released.** It comes only from the `windows` job of the CI workflow (`.github/workflows/ci.yml`), together with CI's own copies of the shipped builds. Take it from the **latest green run on `main`**.

1. Before you download, check two things:
   - **The run has the cloud URL.** The app's content security policy fixes the Supabase URL at build time. Without the repository variable, a CI build points at `http://127.0.0.1:54721` and cannot reach the cloud project. So the repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_LOCK_EXTENSION_ID` must have been set (P.2, `cloud-setup.md`) before that run.
   - **The artifacts still exist.** They are kept for 14 days.
2. In the browser: GitHub, then Actions, then CI. Filter by branch `main`, open the newest run with a green check, and on its Summary page go to Artifacts.
3. Or from the MacBook:

   ```sh
   RUN=$(gh run list --workflow CI --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId')
   gh run download "$RUN" -n uki-windows-x64-lab-zip -D lab-usb
   ```

| Artifact | File | What it is |
| --- | --- | --- |
| `uki-windows-x64-zip` | `Uki-<version>-x64.zip` | The shipped app, unpacked. It runs from any folder or the USB drive with no install |
| `uki-windows-x64-lab-zip` | `Uki-lab-<version>-x64.zip` | The same app with the developer overlay and the development escape on. Never ships |
| `uki-windows-x64-installer` | `Uki-<version>-x64.exe` | The NSIS installer. Its install-mode page offers the current user only |
| `uki-lock` | `Uki-Lock-chrome.zip`, `Uki-Lock-edge.zip` | Üki Lock for Chrome and Edge, under the release names |

CI's copies of the shipped builds come from the same commit as its lab zip; the release may come from an older one. Both are built with the same Lock key pair, so the lab zip pairs with the release's Lock too. A browser download wraps each artifact in one more zip, so unzip it once. Copy everything to a USB drive: the lab PC may wipe itself when it restarts.

### The lab zip

The lab zip is the shipped app built with `electron-vite build --mode lab`. It is for the lab session only.

- **Ctrl+Shift+D** shows or hides the developer overlay. Read face tracking as `fps` and phone checks as `phone/s` there. Read the app's CPU in Task Manager: the sum of the `Uki` processes.
- **Ctrl+Shift+Q** leaves a stuck lockdown and stops the process scan. The keyboard hook lets this key through.

The shipped zip and the installer have neither. In those, only a proctor's **End session** on the dashboard releases a student.

**If a lockdown gets stuck,** try these in order:

1. End the session from the dashboard.
2. In the lab zip, press Ctrl+Shift+Q.
3. Press Ctrl+Alt+Del, open Task Manager and end `Uki`. Ctrl+Alt+Del always stays with Windows.

## 2. Before the session

The checklist from `docs/phase-0-plan.md`:

- [ ] The lab allows you to run your own software; if security software blocks it, ask lab IT.
- [ ] A USB webcam, in case the PC has none.
- [ ] The Windows zip, the installer and both Üki Lock zips from the latest release, and the lab zip from the latest green CI run, on a USB drive: the PC may wipe itself on reboot.
- [ ] `pnpm demo:reset` against the cloud project, and a phone hotspot in case the lab network blocks websockets.

Also take:

- the installer;
- the printed card for 20231187;
- a phone to photograph each result;
- the dashboard open on your MacBook, signed in as Aigerim on the Mathematics 2 lobby, so you can start and end the exam.

**USB webcam.** Plug it in before you start Üki. If 1.2 shows the wrong camera, unplug the other one or turn it off in Device Manager, if the lab allows that.

## 3. SmartScreen and antivirus

**SmartScreen.** The app is unsigned in Phase 0, so Windows may show "Windows protected your PC" for `Uki.exe` or the installer. Choose **More info**, then **Run anyway**. Files from a browser download carry the internet mark. Before unzipping, right-click the zip, choose Properties and tick **Unblock**, so that the unzipped files do not each prompt again.

**Antivirus and the keyboard hook.** During an exam, Üki installs a low-level keyboard hook (`SetWindowsHookExW` with `WH_KEYBOARD_LL`) through Koffi. Some security products treat any keyboard hook as keylogger behaviour. They may block or quarantine the Koffi binary, `resources\koffi\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node` in the app folder, or warn when the exam starts.

The hook:

- runs only from lockdown on until lockdown off;
- reads only each key event's virtual-key code and flags;
- keeps nothing, logs nothing and sends nothing (`apps/desktop/src/main/key-filter.ts` and `keyboard-hook-win32.ts`).

If a security product stops it:

1. Write down the product, its exact message and what got it past.
2. Ask lab IT to allow the app folder.

Without the hook the app still runs. Lockdown falls back to the blur rule, which brings the exam back and logs `tab.blocked`. Record that as a known limit.

**Whether the hook loaded.** The main process log says `[desktop] keyboard hook ready` at launch, `keyboard hook on` at Start exam and `keyboard hook off` at the end. It says `keyboard hook failed to load` if Koffi was blocked. To see the log, start the app from PowerShell in its folder:

```powershell
Start-Process .\Uki.exe -RedirectStandardOutput "$env:TEMP\uki-out.txt" -RedirectStandardError "$env:TEMP\uki-err.txt"
Get-Content "$env:TEMP\uki-out.txt", "$env:TEMP\uki-err.txt" | Select-String 'keyboard hook'
```

## 4. In the session

The checklist from `docs/phase-0-plan.md`, with the steps for each line. Photograph every result.

- [ ] The app starts from the USB drive or a folder in your profile without admin rights; write down any SmartScreen or antivirus prompt and what got it past.
  1. Unzip `Uki-win-x64.zip` (or CI's `Uki-<version>-x64.zip`) to the USB drive, or to a folder under `%USERPROFILE%`, such as `%USERPROFILE%\Uki`.
  2. Run `Uki.exe` as the lab's standard user.
  3. Section 3 has the prompts.
- [ ] 1.2 sees the camera; if the Windows camera privacy settings are locked by policy, write it down.
  - The settings are under Settings, Privacy & security, Camera: "Camera access" and "Let desktop apps access your camera".
- [ ] During lockdown the Windows keys, Alt+Tab, Alt+Esc, Ctrl+Esc and Alt+F4 do nothing; Ctrl+Alt+Del and Win+L still work, and the wall shows the focus loss.
  1. Join with `MATH2-204-FRI` and 20231187, pass 1.2 to 1.4, and press Start exam as Aigerim.
  2. During 2.1, press each of these: the Windows key alone, Win+D, Win+Tab, Win+R, Alt+Tab, Alt+Shift+Tab, Alt+Esc, Ctrl+Esc and Alt+F4. Each does nothing, and the exam stays in front.
  3. The keyboard hook swallows the Windows keys, Alt+Tab, Alt+Esc and Ctrl+Esc. The window refuses Alt+F4, because close is blocked during lockdown.
  4. Press Ctrl+Alt+Del and then Cancel, then Win+L and sign in again. Both work, because they stay with Windows. When you come back, the wall shows a focus loss for Madina: `tab.blocked` with no app name.
  5. Ctrl+Shift+Esc opens Task Manager. The hook leaves it to Windows on purpose, as it does Ctrl+Alt+Del, and the wall shows the focus loss the same way.
  6. In the lab zip, Ctrl+Shift+Q still leaves lockdown.
- [ ] A blocked app on the PC turns 1.2 red, and one opened mid-exam sends `tab.blocked`.
  - Microsoft Teams is on the blocked list and often comes preinstalled.
  - An app opened during 2.1 shows on the wall with its name within 15 s, at the next process scan.
- [ ] PrtScn, Win+Shift+S and the Snipping Tool capture no exam window.
  - Win+Shift+S cannot open during lockdown, because the hook swallows the Windows key. Try it on 1.2 to 1.4 too: content protection is on from launch.
  - During 2.1, try PrtScn and the Snipping Tool's timer.
- [ ] The lab zip's overlay shows face tracking at 15 fps or more and phone checks at 2 per second or more, with the app under 40% CPU; write down the CPU model and whether the PC has a graphics card.
  - Use the lab zip and press Ctrl+Shift+D during 2.1.
  - The CPU model is in Settings, System, About. Whether there is a graphics card is in Task Manager, Performance, GPU.
  - Also measure with the window hidden: a browser exam (Physics 1) runs detection with the window hidden.
- [ ] Üki Lock loads unpacked in Chrome and Edge, pairs by code and closes a second tab; if browser policy blocks unpacked extensions, write it down.
  - `lock-pairing.md` has the steps.
- [ ] The NSIS installer installs for the current user and starts, if the lab allows installers.
  - Run `Uki-Setup-win-x64.exe` and choose "Only for me". It installs to `%LOCALAPPDATA%\Programs\Uki`.
- [ ] One run of the demo script against the cloud project.

## 5. Where the results go

Write each result, with its photo, into `docs/phase-0-exit.md`. That means the WP 0.14 rows and the rows each check names: 0.5, 0.6, 0.8 and exit criteria 3 and 10.

- **Status.** Each result is pass, fail, or a known limit with the reason.
- **Photos.** Put them in `docs/evidence/phase-0/lab/` as small JPEGs.
- **Also record:**
  - the date and the PC model;
  - the CPU and the graphics card;
  - the Windows edition and build (`winver`);
  - the release tag and the CI run id the builds came from;
  - every security prompt.

## 6. The MacBook as the student machine

**Take the release, or build on the MacBook itself.** The release's `Uki-mac-arm64.dmg` (Apple silicon) and `Uki-mac-x64.dmg` (Intel) are built against the cloud project and pair with the release's Üki Lock; install them as below, quarantine step included. A build made on the Mac that runs it carries no quarantine flag, so Gatekeeper does not object.

```sh
git clone <repository-url> uki && cd uki
corepack enable && pnpm install
```

Create `.env` in the repository root. It holds the cloud project's **public** values only: the secret key never goes onto a student machine.

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_LOCK_EXTENSION_ID=<the fixed Üki Lock id from LOCK_DEV_PUBLIC_KEY>
VITE_EXAM_OFFICE_EMAIL=<the exam office address for 2.1d Exam ended; exams@kru.test in .env.example>
UKI_ALLOW_CAPTURE=0
```

```sh
pnpm models && pnpm models:verify      # 59 MB; refuses any file whose SHA-256 differs from the manifest
pnpm --filter desktop dist             # Uki-<version>-arm64.dmg and Uki-<version>-x64.dmg in apps/desktop/release/
```

Development runs (`pnpm dev`) are different from the packaged build in two ways. `UKI_ALLOW_CAPTURE=1` affects only development runs; packaged builds always keep content protection on. Development runs also keep the escape, Cmd+Shift+Q.

**Install:**

1. Open the dmg and drag Üki to Applications.
2. If the app came from somewhere else, such as the release or a CI artifact, macOS has quarantined it. Remove the flag once:

   ```sh
   xattr -dr com.apple.quarantine "/Applications/Uki.app"
   ```

   Without this step, macOS says the app "is damaged and can't be opened". If it says the developer cannot be verified instead, Control-click the app, choose Open, then Open again.
3. On first launch, allow the camera. If you denied it, turn on Üki in System Settings, Privacy & Security, Camera, and restart the app.
4. Check that 1.1 shows in Kazakh, that the language switch reaches Russian and English, and that 1.2's network row answers under 1,000 ms.

**The lockdown hand checks (P.4, WP 0.13).** Run them on the packaged build, which has no development escape. Keep the dashboard open on the other screen: End session is the way out.

1. Start Mathematics 2 as Aigerim.
2. During 2.1, try each of these:
   - Cmd+Tab
   - Cmd+Q
   - Force Quit (Cmd+Option+Esc)
   - the menu bar
   - Spotlight (Cmd+Space)
   - Mission Control (Ctrl+Up or F3)
   - Notification Center (click the clock, or swipe left from the trackpad's right edge)
   - the screenshot keys (Cmd+Shift+3, 4 and 5)

   Cmd+Tab, Cmd+Q, Force Quit and the menu bar must do nothing. Spotlight, Mission Control, Notification Center and the screenshot keys must either do nothing, or bring the exam back and log `tab.blocked` with no app name, at most once every 5 s on the wall.
3. A screenshot taken before the exam must show no exam window.
4. End the session from the dashboard.

Record the results under "P.4 Lockdown guard" in `docs/phase-0-exit.md`.

## 7. Üki Lock in Chrome and Edge

1. Take `Uki-Lock-chrome.zip` or `Uki-Lock-edge.zip` from the release (or CI's `uki-lock` artifact) and unzip it into a folder you keep, or build it on the MacBook (`pnpm --filter lock build`, output `apps/lock/.output/chrome-mv3`).
2. Open `chrome://extensions` or `edge://extensions`, turn on Developer mode, choose Load unpacked and pick the folder. When `LOCK_DEV_PUBLIC_KEY` was set at build time, the extension id is fixed and matches `VITE_LOCK_EXTENSION_ID` in the app. The release always has both: its Lock's id is `enjmmceojibbmnjiplojklhkgmghcchp`, the one its app accepts.
3. Pin Üki Lock to the toolbar. Pairing, the 10-quiet-minutes check and the E.3 to E.9 walk-through are in [lock-pairing.md](lock-pairing.md).

## 8. Before every rehearsal (T minus 30 minutes)

On the MacBook, with the cloud values in `.env.cloud` (see [cloud-setup.md](cloud-setup.md)):

```sh
pnpm demo:reset --env-file .env.cloud          # Mathematics 2 starts in 15 minutes, Physics 1 started 5 minutes ago
pnpm demo:simulate --env-file .env.cloud --watch
```

`demo:simulate` keeps running and prints the lobby counts every 10 seconds. With `--watch` it also prints the time from each simulated event to its broadcast on the wall. Leave it running through the demo. Ctrl+C stops it cleanly, and the simulated tiles stay until the next `demo:reset`. Madina's number is never simulated, so the student machine can join. Say on stage that the other tiles are simulated.

Then:

1. Sign in on the dashboard as Dana (overview), and in a second window as Aigerim (Mathematics 2 lobby) and Gulnara (Physics 1 wall).
2. On the student machine (a lab PC or the MacBook), quit Telegram unless the demo shows it on 1.2, and close the other apps on the blocked list. Keep the printed card for 20231187 at hand.
3. For the browser exam, close every browser tab but one on the student machine, and keep the card for 20231455 at hand.
4. Run the demo script once end to end. Then run `pnpm demo:reset --env-file .env.cloud` again before the real run.

## 9. Network fallback

The venue network may block websockets or drop. In order of preference:

1. **Phone hotspot.** Put the student machine and the dashboard machine on one hotspot, and check that `https://<project-ref>.supabase.co/auth/v1/health` answers (1.2 shows the round trip). Machines on one hotspot share one public IP, so they also share the cloud project's limit of 30 anonymous sign-ins an hour. If a join fails with a rate limit, raise the limit under Authentication, Rate limits in the Supabase dashboard.
2. **Short drops are fine.** The app's outbox keeps answers and events through minutes offline. 2.1a shows, and everything syncs on reconnect without duplicates.
3. **Last resort: the local stack over the LAN.** Use this only if Frankfurt is unreachable.
   1. On the MacBook, run `supabase start -x vector,logflare,imgproxy,edge-runtime`, `pnpm env:local`, `pnpm seed:staff` and `pnpm demo:reset`, then `pnpm dev`, which serves the Edge Functions.
   2. Rebuild the student app with `VITE_SUPABASE_URL=http://<MacBook-LAN-IP>:54721` and the local publishable key (`SUPABASE_PUBLISHABLE_KEY` in the MacBook's `.env`).
   3. Keep every machine on one Wi-Fi or hotspot. The app's content security policy allows exactly that URL over http and ws.

   This loses the "runs on Supabase Cloud" story, so say so on stage.
