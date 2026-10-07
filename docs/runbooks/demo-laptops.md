# Runbook: the demo laptops

Three laptops run the demo (docs/phase-0-plan.md, Demo script and seed data): a MacBook as Madina Tulegenova (20231187, Mathematics 2 in the Üki app), a Windows laptop with an 8th-gen Core i5 as Aliya Seitkali (20231455, Physics 1 in the browser with Üki Lock), and a dashboard laptop for the proctors. All three use the cloud project in Frankfurt.

## 1. Build the installers on the laptops themselves

A build made on the laptop that runs it carries no quarantine flag, so macOS opens it without the Gatekeeper dance. Do this on the MacBook and on the Windows laptop.

```sh
git clone <repository-url> uki && cd uki
corepack enable && pnpm install
```

Create `.env` in the repository root with the cloud project's **public** values only (the secret key never goes onto a student laptop):

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_LOCK_EXTENSION_ID=<the fixed Üki Lock id from LOCK_DEV_PUBLIC_KEY>
UKI_ALLOW_CAPTURE=0
```

Then fetch the models, verify them and build:

```sh
pnpm models && pnpm models:verify      # 59 MB; refuses any file whose SHA-256 differs from the manifest
pnpm --filter desktop dist             # macOS: one dmg per architecture (arm64, x64) in apps/desktop/release/
                                       # Windows: apps/desktop/release/Üki Setup <version>.exe
```

The installers are unsigned in Phase 0. `UKI_ALLOW_CAPTURE=1` only affects development runs (`pnpm dev`); packaged builds always keep content protection on.

## 2. Install on macOS

1. Open the dmg and drag Üki to Applications.
2. If the app came from somewhere else (the CI artifact or the draft release from `desktop-dist.yml`), macOS has quarantined it. Remove the flag once:

   ```sh
   xattr -dr com.apple.quarantine "/Applications/Üki.app"
   ```

   Without this, macOS says the app "is damaged and can't be opened". If it says the developer cannot be verified instead, Control-click the app, choose Open, then Open again.
3. First launch: allow the camera when asked. If you denied it, enable Üki in System Settings > Privacy & Security > Camera and restart the app.
4. Check: 1.1 shows in Kazakh, the language switch reaches Russian and English, and 1.2's network row answers under 1,000 ms.

## 3. Install on Windows

1. Run `Üki Setup <version>.exe`.
2. SmartScreen shows "Windows protected your PC" for the unsigned installer: choose **More info**, then **Run anyway**.
3. Settings > Privacy & security > Camera: turn on "Camera access" and "Let desktop apps access your camera".
4. Check as on macOS.

## 4. Üki Lock in Chrome and Edge

1. Build it on the laptop (`pnpm --filter lock build`, output `apps/lock/.output/chrome-mv3`) or take the zip from CI (`uki-lock` artifact, unzip it).
2. `chrome://extensions` or `edge://extensions` > Developer mode > Load unpacked > pick the folder. With `LOCK_DEV_PUBLIC_KEY` set at build time the extension id is fixed and matches `VITE_LOCK_EXTENSION_ID` in the app.
3. Pin Üki Lock to the toolbar. Pairing, the 10-quiet-minutes check and the E.3 to E.9 walk-through: [lock-pairing.md](lock-pairing.md).

## 5. Before every rehearsal (T minus 30 minutes)

On the dashboard laptop, with the cloud values in `.env.cloud` (see [cloud-setup.md](cloud-setup.md)):

```sh
pnpm demo:reset --env-file .env.cloud          # Mathematics 2 starts in 15 minutes, Physics 1 started 5 minutes ago
pnpm demo:simulate --env-file .env.cloud --watch
```

`demo:simulate` keeps running and prints the lobby counts every 10 seconds; `--watch` also prints the time from each simulated event to its broadcast on the wall. Leave it running through the demo; Ctrl+C stops it cleanly and the simulated tiles stay until the next `demo:reset`. Madina's number is never simulated, so the MacBook can join. Say on stage that the other tiles are simulated.

Then:

1. Sign in on the dashboard as Dana (overview) and in a second window as Aigerim (Mathematics 2 lobby) and Gulnara (Physics 1 wall).
2. On the MacBook, quit Telegram unless the demo shows it on 1.2, close other apps from the blocked list, and keep the printed card for 20231187 at hand.
3. On the Windows laptop, close every browser tab except one, and keep the card for 20231455 at hand.
4. Run the demo script once end to end, then `pnpm demo:reset --env-file .env.cloud` again before the real run.

## 6. Network fallback

The venue network may block websockets or drop. In order of preference:

1. **Phone hotspot.** Put all three laptops on one hotspot. Check `https://<project-ref>.supabase.co/auth/v1/health` answers (1.2 shows the round trip). Laptops on one hotspot share one public IP, so they share the cloud project's limit of 30 anonymous sign-ins an hour: if a join fails with a rate limit, raise it under Authentication > Rate limits in the Supabase dashboard.
2. **Short drops are fine.** The app's outbox keeps answers and events through minutes offline; 2.1a shows and everything syncs on reconnect without duplicates.
3. **Last resort: the local stack over the LAN.** If Frankfurt is unreachable, run `supabase start` and `pnpm dev` on the dashboard laptop, then rebuild the two student apps with `VITE_SUPABASE_URL=http://<dashboard-laptop-LAN-IP>:54721` and the local publishable key (`supabase status -o env`), all on one Wi-Fi or hotspot. The app's content security policy allows exactly that URL over http and ws. Run `pnpm db:reset && pnpm seed:staff` there first. This loses the "runs on Supabase Cloud" story, so say so.

## 7. Hand checks owned by these laptops

Record each in `docs/phase-0-exit.md` with the date and evidence:

- The whole demo script on both laptops against the cloud project.
- macOS: Cmd+Tab, Force Quit and the menu bar do nothing during lockdown; a screenshot shows no exam window.
- Windows: Alt+Tab and the Windows key refocus the exam and log `tab.blocked`; a screenshot shows no exam window.
- Üki Lock pairs in Chrome on macOS and in Chrome and Edge on Windows and stays paired through 10 quiet minutes.
- A network log of a 10-minute exam from a development build shows no image upload outside `frames/`.
- Face tracking at 15 fps or more and phone checks at 2 per second or more, app under 40 % CPU (the developer overlay, Ctrl+Shift+D in development builds).
- Every student screen shows the Kazakh letters in Geist.
