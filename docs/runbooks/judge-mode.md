# Runbook: judge mode

Judges open Üki from a link and find it working at any hour: one exam, "Demo · Live" (code `DEMO-LIVE`), is always live on the cloud project, with about 24 simulated students writing it. A small simulator on the Windows VPS plays the students; the database keeps the exam live forever; the judge signs in with a read-only account. This runbook says what runs where, how to set it up, deploy it to the VPS, restart it, read its logs and remove it, and why it stays inside Supabase's free plan for 30 days of 24/7 running.

Decisions behind it: `docs/decisions.md`, "Judge mode". Evidence: `docs/phase-1-exit.md`, "Judge mode".

## What runs where

| Piece | Where | What it does |
| --- | --- | --- |
| `DEMO-LIVE`, group `DEMO`, students 20249001 to 20249030, 20 questions, `judge@kru.test` | Cloud database | Made once by `pnpm judge:setup` on your laptop, with the secret key from `.env.cloud` |
| The `observer` staff role | Cloud database (`20261013100100_judge_mode.sql`) | Reads exactly what an assigned proctor reads; a statement trigger on every table refuses every write it could reach (commands, notes, decisions, replies, share links, seats, the wizard) with `forbidden` / `read_only`. Its reads still write their audit rows |
| `demo_live_tick` | `pg_cron`, every minute | Keeps `DEMO-LIVE` live: with less than 30 minutes left it deletes the run's sessions, events, frames rows, help requests, commands, answers, decisions and reports, starts a new 720-minute run now with the lobby open, writes a `demo_live.rollover` audit row and asks `demo-live-purge` to delete the stills. A cancelled `DEMO-LIVE` is left alone: that is the off switch |
| `demo-live-purge` | Edge Function (secret key, called by the tick through `pg_net` with the Vault key) | Deletes the stills of sessions that no longer exist (`demo_live_orphans`) through the Storage API. Once an hour the tick also calls it when an upload landed after a rollover |
| `session_heartbeat`, `demo_live_status`, `demo_live_seen` | RPCs | A student's "I am here" without an Edge Function call (10 s throttle, as ingest); DEMO-LIVE's timing and how many walls are open; the open wall's "I am here" |
| The simulator, `judge-sim.mjs` | VPS, `C:\apps\uki\judge-sim`, Scheduled Task `uki-judge-sim` | 24 simulated students with the project URL and the **publishable** key only. Each signs in anonymously once and keeps its refresh token in `C:\apps\uki\state`; joins with `join_exam` (again after each rollover); stays online with `session_heartbeat`; plays episodes through `ingest` with the brand kit's evidence stills |
| The watchdog | VPS, Scheduled Task `uki-judge-sim-watchdog` (every 5 minutes, SYSTEM) | Restarts the simulator when it is not running, stopped writing `state\alive.json`, or uses more than 250 MB |
| The simulator indicator | Dashboard, the `DEMO-LIVE` wall only | "Simulator: live · last seen 4 s ago", stopped after 60 s; tells the database the wall is open (every 30 s while visible) and reloads the wall after a rollover |
| Live demo button, `/demo`, `/demo/live`, `/try` | Dashboard (the jury guide and `/try` packages) | The landing's Live demo button goes to `/sign-in?email=judge%40kru.test&next=/demo/live`; `/demo/live` opens the `DEMO-LIVE` wall |

Nothing in judge mode runs on your Mac after setup, and the VPS never holds the secret key.

## What the simulator does

Two cadences, chosen every second from `demo_live_status`:

- **Idle**, while no wall is open: every student writes `last_seen_at` every 4 to 5 minutes, one incident every 5 minutes somewhere in the class (so an opened wall shows the last hour's flags), and a status poll every 5 seconds.
- **Watched**, while at least one `DEMO-LIVE` wall is open (seen in the last 90 s): heartbeats every 18 to 20 s (the wall marks No signal after 30 s), an incident every 30 s, an answer per student every 6 minutes, Ask proctor at most every 10 minutes. A judge who opens the wall wakes the class within the 5-second poll; the tiles that showed No signal come back within seconds.

Episodes: a phone in hand (score 0.86 to 0.93, one still) and raised to the screen (0.95 to 0.99, two stills), a long look down, side glances left and right, a second face (two stills), an empty seat (`face.missing` and `session.paused`, back with `session.resumed` 20 to 60 s later), an app switch (`tab.blocked` with `app: null`), a forbidden app (`tab.blocked` with `app: "Telegram"`), answers, and the odd Ask proctor. Episodes go to the students who played longest ago, so the whole class takes part. `node judge-sim.mjs --dry-run` prints the full table and a sample plan.

## Setup, once, on your laptop

Needs: the migrations on the cloud project (they deploy on every merge to `main` through `deploy-supabase.yml`), the seed loaded and `seed:staff` run (`docs/runbooks/cloud-setup.md`, steps 3 and 4), and the two Vault secrets `uki_project_url` and `uki_secret_key` (cloud-setup step 2), without which the rollover cannot ask `demo-live-purge` to delete stills.

```sh
pnpm judge:setup --env-file .env.cloud
```

It asks before touching the cloud project (`--yes` skips the question) and prints what it did, never the password:

- group `DEMO` with 30 students, `DEMO-LIVE` "Demo · Live" live now for 720 minutes (or kept as it is when it has a run with 30 minutes or more left), and 20 questions copied from Mathematics 2;
- `judge@kru.test`, role `observer`, assigned to `DEMO-LIVE` only, its password `JUDGE_PASSWORD` from `.env.cloud`, or a new random one appended to `.env.cloud`;
- the judge one-pager at `uki-judge-one-pager.md` next to the repository (`/Users/k4ssym/Downloads/qostanai/uki-judge-one-pager.md`): the dashboard and Live demo links, the email, the password, `/demo` and `/try`, three things to try. It is written outside the repository on purpose; `--one-pager <path>` puts it elsewhere, never inside the repository.

Run it again at any time: it fills in what is missing and changes nothing else. A new judge password: delete the `JUDGE_PASSWORD` line from `.env.cloud` and run it again.

Check: open the Live demo link from the one-pager in a private window, sign in, and the `DEMO-LIVE` wall opens. Before the simulator runs, the indicator says "Simulator: stopped · not seen yet".

## Deploy to the VPS

On your laptop, build the folder the VPS gets:

```sh
pnpm --filter judge-sim build
node apps/judge-sim/dist/judge-sim/judge-sim.mjs --dry-run      # the plan and the free-plan arithmetic; talks to nothing
```

`apps/judge-sim/dist/judge-sim/` holds `judge-sim.mjs` (one file, about 0.9 MB, with zod and the contracts inside), `stills\*.jpg` (five 640 × 360 JPEGs from the brand kit's evidence images, 40 to 47 KB each), `install.ps1`, `watchdog.ps1` and `uninstall.ps1`. No monorepo install and no third-party binary on the VPS.

Copy the folder to the VPS (over the RDP clipboard or as a zip), then in an **elevated** Windows PowerShell there:

```powershell
cd <the copied judge-sim folder>
powershell -ExecutionPolicy Bypass -File .\install.ps1 -SupabaseUrl https://<ref>.supabase.co -PublishableKey sb_publishable_...
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `-SupabaseUrl`, `-PublishableKey` | required | The cloud project and its publishable key. A secret key is refused, by the script and by the simulator |
| `-ExamCode` | `DEMO-LIVE` | |
| `-Students` | `20249001-20249024` | 24 of the 30; 20249025 to 20249030 stay free for a person with the real app |
| `-InstallRoot` | `C:\apps\uki` | Everything of Üki on the VPS lives here |
| `-TaskPrefix` | `uki-` | Task names: `uki-judge-sim`, `uki-judge-sim-watchdog` |
| `-MemoryLimitMb` | `250` | The watchdog restarts the simulator above this |
| `-NoStart`, `-SkipNodeInstall` | off | For tests |

What it does:

1. Node.js 24 LTS: kept when `node.exe` 24 or later is installed; otherwise downloaded from nodejs.org (`index.json`, the x64 MSI, checked against `SHASUMS256.txt`) and installed silently.
2. Copies the bundle, the stills and the scripts to `C:\apps\uki\judge-sim`, writes `C:\apps\uki\judge-sim.env` (UTF-8 without BOM: the URL, the publishable key, the exam code, the students, the state and log folders), and makes `C:\apps\uki\state` and `C:\apps\uki\logs`. Only LOCAL SERVICE, SYSTEM and Administrators can read the state (the refresh tokens).
3. Runs the bundle's `--dry-run` with that env file, so a broken copy fails now rather than at the next boot.
4. Registers `uki-judge-sim`: at startup, as `NT AUTHORITY\LOCAL SERVICE` (runs whether or not anyone is logged on, no password stored), `node --max-old-space-size=96 judge-sim.mjs --env-file C:\apps\uki\judge-sim.env`, restarted a minute after a failure (999 times), no time limit, one instance. And `uki-judge-sim-watchdog`: every 5 minutes and at startup, as SYSTEM.
5. Starts `uki-judge-sim`.

Check, on the VPS:

```powershell
Get-ScheduledTask uki-judge-sim* | Format-Table TaskName, State
Get-Content C:\apps\uki\logs\judge-sim.log -Tail 20
Get-Content C:\apps\uki\state\alive.json
```

The first start signs the 24 students in, 10 seconds apart (about 4 minutes), each once for good. The log shows "signed in as a new anonymous user (stored for every restart)" for each, then the joins. On the dashboard the indicator turns "Simulator: live" and the tiles come online.

## Restart, stop, upgrade

| To | Do |
| --- | --- |
| Restart the simulator | `Stop-ScheduledTask uki-judge-sim; Start-ScheduledTask uki-judge-sim` (the watchdog also restarts it within 5 minutes when it stops) |
| Stop it for a while | `Disable-ScheduledTask uki-judge-sim-watchdog; Disable-ScheduledTask uki-judge-sim; Stop-ScheduledTask uki-judge-sim`, and `Enable-ScheduledTask` both to resume |
| Upgrade it | Build again, copy the new folder, run `install.ps1` again with the same parameters: the tasks stop, the files are replaced, the state stays, the tasks start |
| Switch judge mode off in the database | The exam office sets `DEMO-LIVE`'s status to `cancelled`; the tick leaves it alone and the simulator waits (`invalid_code`). Setting it back to `live` gives it a new run at the next tick |
| Start a fresh run now | `pnpm judge:setup` does not; move the exam's `starts_at` back 700 minutes and the next tick rolls it over |

## Logs

| Where | What |
| --- | --- |
| `C:\apps\uki\logs\judge-sim.log`, `judge-sim.1.log` … `judge-sim.4.log` | The simulator: the start, every new anonymous user, the joins, mode changes (idle and watched), rollovers, warnings, and a summary every 5 minutes (mode, open walls, students online, the day's Realtime budget, heartbeats, incidents, answers, asks, stills, joins, errors, memory). Rotated at 5 MB, five files at most (25 MB). No token or key is ever logged |
| `C:\apps\uki\logs\watchdog.log`, `watchdog.1.log` | Each restart and why. Rotated at 1 MB |
| `C:\apps\uki\state\alive.json` | Written every 30 s: pid, mode, open walls, students online, the run, memory. The watchdog reads its age |
| Supabase dashboard | Integrations > Cron: `demo_live_tick` every minute (its own history is trimmed to a day). `audit_log` rows `demo_live.rollover` with the counts. Edge Functions > `demo-live-purge` logs "removed N of N stills" |

## Uninstall

```powershell
C:\apps\uki\judge-sim\uninstall.ps1            # tasks, node.exe, C:\apps\uki\judge-sim and judge-sim.env
C:\apps\uki\judge-sim\uninstall.ps1 -Purge     # also the state and the logs, and C:\apps\uki when empty
```

Without `-Purge` the state stays, so a later install reuses the same 24 anonymous users. Node.js stays installed either way: the VPS is shared.

## Footprint on the VPS

Üki must stay under about 600 MB of RAM on the shared 2 GB VPS. The simulator is one Node.js process with its heap capped at 96 MB; the bundle used 84 MB resident at idle on the MacBook (`alive.json`, `rss_mb`), and the watchdog restarts it above 250 MB. No Realtime socket, no browser, no database on the VPS. Disk: the bundle and stills under 1.2 MB, the logs at most 26 MB, the state a few kilobytes.

## The free plan: the arithmetic

Supabase Free plan quotas, read on 9 October 2026 in the Supabase docs ([About billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [Realtime messages](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages), [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)): 2,000,000 Realtime messages, 200 peak Realtime connections, 500,000 Edge Function invocations, 5 GB egress (plus 5 GB cached), 1 GB Storage, 500 MB database per project, 50,000 monthly active users. Realtime counts every broadcast once when it is sent and once more for every client that receives it, and the dashboard's tiles are broadcasts: each `last_seen_at` write, each event, each state change, each confirmed still and each help request.

That is what decides the cadence. Every student online all the time is the expensive part: a write every 18 to 20 s for 24 students is 4,547 broadcasts an hour, and 24 hours of the watched cadence with one judge watching would be 7.9 million messages a month, about four times the plan. So the simulator plays the full cadence only while a wall is open and idles otherwise, and a daily budget caps what it may cause.

Per hour, 24 students, nobody watching (from `apps/judge-sim/src/budget.ts`; the dry run prints the same):

| Cadence | Broadcasts | Of which heartbeats | Incidents | Answers | Ask proctor | Function calls | Egress |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Idle | 357 | 311 | 12 | 0 | 0 | 22.7 | 1.0 MB |
| Watched | 5,477 | 4,547 | 114 | 240 | 6 | 461.7 | 5.2 MB |

Each open wall receives every broadcast once more. Episode costs (broadcasts, function calls, stills): phone in hand 3, 2, 1; phone raised 4, 2, 2; look down 4, 2, 1; side glance 4, 2, 1; second face 4, 2, 2; empty seat 8, 3, 1; app switch and forbidden app 2, 1, 0; answer 2, 1, 0; Ask proctor 3, 1, 0. A join with its check-in is 5 broadcasts and one call; every student joins twice a day (the rollovers).

**The daily budget.** The simulator counts the messages it causes, each broadcast times one plus the open walls, per UTC day, and keeps the watched cadence only while the day still has room for idle until midnight plus ten more watched minutes: 35,000 messages a day (`UKI_DAILY_MESSAGE_BUDGET`), at most 1,050,000 a month, 52.5 % of the plan, whatever the judges do. Idle alone, with the two rollovers' joins, is 8,800 a day, so the budget allows about 2.5 hours of watched cadence a day with one wall open, 1.6 hours with two. Past that the wall still works and the class stays in idle cadence until 00:00 UTC (the log says so once an hour).

Thirty days of 24/7 running, 24 students:

| Scenario | Realtime messages | Function calls | Egress | Stills held at most |
| --- | --- | --- | --- | --- |
| Idle only | 264,065 (13.2 %) | 17,786 (3.6 %) | 805 MB (15.7 %) | 12.4 MB (1.2 %) |
| Budget spent every day, 1 wall open (2.5 h a day) | 1,050,000 (52.5 %) | 50,344 (10.1 %) | 1,318 MB (25.7 %) | 35.1 MB (3.4 %) |
| Budget spent every day, 2 walls open (1.6 h a day) | 1,050,000 (52.5 %) | 39,250 (7.9 %) | 1,274 MB (24.9 %) | 27.3 MB (2.7 %) |

- **Realtime connections:** the simulator opens none; each open wall is one.
- **Storage:** stills are 40 to 47 KB; the rollover purges a run's stills, so Storage holds at most one 690-minute run plus one run of leftovers.
- **Database:** a run's events, frames rows and sessions are deleted at each rollover; what grows is `audit_log` (joins, rollovers and the judges' reads, a few hundred rows a day) and `cron.job_run_details`, which the tick trims to a day for its own job. Well under 500 MB.
- **Auth:** 24 anonymous users, made once (the project allows about 30 anonymous sign-ins an hour per IP; the simulator makes at most 25 an hour, 10 s apart, and remembers them across restarts). Monthly active users: 24 plus the judges.
- **Egress** is mostly the 5-second status poll (about 15 MB a day) and the heartbeats; the stills judges open are 46 KB each.
- **Pausing:** a Free project pauses after a week without activity; the simulator's calls never let that happen.

The tests hold the numbers to these limits: `apps/judge-sim/test/budget.test.ts` checks that with the daily budget spent every day and 1, 2, 3 or 5 walls open every quota stays under 60 %, and that the daily budget holds a day with five walls open all day.

## When things go wrong

| Sign | Cause | What happens, what to do |
| --- | --- | --- |
| "sign-in lost; a new anonymous user follows" in the log, then "already_joined" | A student's refresh token was refused (used twice after a crash at the wrong moment) | The student signs in as a new user; its seat stays bound to the old user until the next rollover (at most 11.5 hours), then it joins again. The other students are unaffected |
| Tiles show No signal for a few seconds when the wall opens | The class was idle | It wakes within the 5-second poll; nothing to do |
| The wall reloads by itself | A rollover started a new run | Expected, twice a day |
| "today's Realtime budget … keeps the idle cadence" in the log | The day's budget is spent | Idle cadence until 00:00 UTC. Raise `UKI_DAILY_MESSAGE_BUDGET` in `judge-sim.env` only after checking the organisation's usage page |
| The indicator says stopped | The simulator is not running or cannot reach the project | `Get-ScheduledTask uki-judge-sim*`, the log, `alive.json`; the watchdog restarts a stopped or hung process within 5 minutes |
| Errors and backoff in the log | The project or the network is down | Each student backs off up to 5 minutes and carries on when it answers |

## Security

- The VPS holds only public values: the project URL and the publishable key. The simulator and `install.ps1` refuse a secret key.
- The students' refresh tokens are in `C:\apps\uki\state`, readable by LOCAL SERVICE, SYSTEM and Administrators only. They can do nothing but write their own simulated student's events.
- The judge's password exists only in `.env.cloud` (gitignored) and in the one-pager outside the repository. It is never printed, logged or committed.
- The judge account reads only, enforced in the database for every table; its reads are audited like a proctor's.
