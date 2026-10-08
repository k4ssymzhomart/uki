# Runbook: Demo Day

How to put the cloud project into the state the Demo Day script v2 starts from (docs/phase-1-plan.md, "Demo Day script v2"), what seed v2 puts on each screen, and what to do between runs. The commands talk to the cloud project over HTTPS with the keys in your gitignored `.env.cloud` (docs/runbooks/cloud-setup.md, step 4). Run them from the repository root on the MacBook.

## What `pnpm demo:reset` does

`pnpm demo:reset --env-file .env.cloud` asks before it touches the cloud project; `--yes` skips the question. It takes about a minute (longer the first time, when it writes the term), and every run ends in the same state:

1. **Realtime.** It signs in as Dana and holds one Realtime connection on Mathematics 2's channel for a few seconds. A Supabase project creates the day's `realtime.messages` partitions only when a client connects; before that, every broadcast fails with `MissingPartition` (seen on 8 October). If no connection works after three tries it still resets the data, then says so and exits with code 1: run it again.
2. **Phase 0.** Mathematics 2 · Midterm (MATH2-204-FRI) starts 15 minutes after the reset, its lobby already open; Physics 1 · Quiz 3 (PHYS1-102-FRI) started 5 minutes before and runs 40 minutes. Every session of both exams goes, simulated ones included.
3. **Seed v2.** The exams the wizard made are deleted (judge mode's DEMO-LIVE stays), the students come back with programme and year, and the rows below are put back exactly.

| On screen | What seed v2 puts there |
| --- | --- |
| 0.1 | Mathematics 2 next, Physics 1 live, History of Kazakhstan to review, Linear Algebra as a draft; below them the 42 reviewed exams of the Autumn 2026 term and Mechanics · Final from the spring term |
| 0.3b | Yerlan Tokhtarov's Mathematics 2 invite bounced at `yerlan.tokhtarov@kru.test`; the other 127 invites sent two days ago |
| 0.9, 0.9a | Nurlan's seats 65 to 128 on Mathematics 2, not confirmed; Aigerim's 1 to 64 confirmed |
| 2.4d on Physics 1 | One open request from a simulated student (Q 6, m/s or km/h), asked from Üki Lock 3 minutes after the start |
| 3.2, 3.3 | History of Kazakhstan's seven flags on five sessions, each with a still, none decided |
| A.1 | The Autumn 2026 term. For the Faculty of Mathematics exactly the frame: 38 exams since 1 Sep, 4,912 sessions, 8.4 flags per 100 (10.5 in September), 23 to the committee (0.5 %), 11.6 down to 8.4 by week, 46/18/14/12/6/4 per cent by flag, 214, 61 and 23 decisions, median review 2:30 down to 1:40 |
| A.2, A.3 | 1,284 students in 13 groups, each with a programme and year (Zhansaya Omarova as an exchange student) |
| A.5, A.5a | A delete request from Kairat Mukanov (20241005, History of Kazakhstan) received 3 days ago, due 7 days after; he has three flags with stills in two History quizzes, so A.5a has frames from two exams to delete |
| A.6 | Zhansaya Omarova's copy request done last week by Dana; the English B2 report made two days ago, shared, and opened twice from the link (a day later and yesterday) |
| Retention | One still dated 91 days ago (Mechanics · Final): a manual retention run removes it |
| 3.4a | Dana's languages with English first, so the dashboard opens in English without a cookie |

Staff accounts, judge mode's exam and the audit log are left alone: rehearsal audit rows stay in A.6 below the new ones.

`pnpm seed:check --demo --env-file .env.cloud` reads the same project and checks all of it, row for row, and A.1's figures through the term views. It changes nothing.

## Before the slot

1. `git pull` on `main` (the freeze tag from Thursday 15 October), and `pnpm install`.
2. About 12 minutes before the slot: `pnpm demo:reset --env-file .env.cloud --yes`. Mathematics 2 then starts 15 minutes later, on stage.
3. `pnpm seed:check --demo --env-file .env.cloud`: every line `ok`.
4. Start the simulator in its own terminal right away, so the lobby fills while people sit down: `pnpm demo:simulate --env-file .env.cloud`. 120 simulated students join Mathematics 2 within 45 seconds; three get stuck in the lobby as 1.5 draws them. Madina's number (20231187) is left for the real laptop.
5. Browsers: profile 1 signed in as Dana (exam office, opens in English); profile 2 as Nurlan; Aigerim's wall on Mathematics 2 and Gulnara's on Physics 1 in further tabs. Reload every open dashboard after a reset.
6. The student machine: the Üki app at 1.1 for Madina; Üki Lock paired for Aliya (docs/runbooks/lock-pairing.md). Your phone on mobile data for the invite and the shared report.

## During the script

- Act 3, Start exam (step 6) starts the simulated class too. Within its first 3 minutes two simulated students ask the proctor, as 2.4d draws them: Saule T. about her camera after 70 seconds and Kamila R. about question 8 after 160 seconds. Madina's own request (step 8) comes on top, so the Requests count can show 3. Say on stage that the tiles and those two requests are simulated.
- Act 4 runs on Physics 1, which ends 35 minutes after the reset: keep the whole script inside that.
- Act 5: the seeded delete request is Kairat Mukanov's (History of Kazakhstan). The audit log then shows the deletion, and the views of your phone a minute before.
- Step 16 ends on A.1. Once Mathematics 2 has run it counts as a 39th exam of the Faculty of Mathematics, in the week of 13 October, so A.1 no longer shows the frame's 38 exactly; that is the real figure. Before Act 1 A.1 shows the frame.

### The 3-minute cut

Reset as above, but leave Madina waiting in the lobby on 1.4 before the slot. Then step 1 (the overview only), steps 6, 7, 8, 13 and 14.

## Between runs

Stop the simulator (Ctrl+C), then `pnpm demo:reset --env-file .env.cloud --yes`, then the simulator again. Reload the dashboards; the student app joins again from 1.1. The reset removes what a run added: the wizard's exam and the students only it knew, the help requests, the reports and share links, the data requests, History's decisions and notes, and every Mathematics 2 and Physics 1 session.

## If something is off

| Sign | What to do |
| --- | --- |
| `demo:reset` ends with "Realtime did not connect" (exit 1) | Run it again. Then open a wall: tiles must move within a second |
| Walls do not move, the simulator's `--watch` reports misses | Reload the wall. If Realtime is down on the project, the demo goes on with reloads (Risks in the plan) |
| `seed:check` fails on the term | `demo:reset` again repairs the term or rebuilds it; then `seed:check` again |
| The request from the simulated Physics 1 student is missing | `demo:reset` puts it back; a Mark done in rehearsal reopens it |
| Mathematics 2 already started | `demo:reset` again: it schedules Mathematics 2 15 minutes ahead |
| Nurlan's seats show as confirmed | `demo:reset` again |
| A.1 shows more than 38 exams, or a week of 13 October, before Act 1 | Another exam of the Faculty of Mathematics has run: `seed:check` names it. Judge mode's DEMO-LIVE, if it is set up in that faculty, is live all day, and A.1 counts it with the term |

Never paste a key or a password into a chat, a slide or a screenshot. `.env.cloud` stays on the MacBook.

## Locally and in CI

`pnpm db:reset` loads `supabase/seed.sql`, which holds the groups, the programmes and the whole term (generated from `scripts/lib/seed-v2/term.ts` by `pnpm seed:term`); `pnpm seed:staff` then writes the term's review decisions. Everything else in the table above comes from `pnpm demo:reset`. CI runs `pnpm seed:check` after `seed:staff`, and `pnpm seed:check --demo` after each `demo:reset`. The load test (`pnpm e2e:load`, 120 sessions and 20 help requests) runs in the Load workflow.
