# Üki design handoff: what is ready in Figma

Oct 7, 2026 · @Kassymzhomart Shubay

Every screen, state and component that the first handoff listed as missing is now designed, including the 12 MUST-story parts for Demo Day on Oct 16, 2026. The Prototype page holds 120 product frames: 44 from round 1 and 76 from round 2. The file also holds 78 components, 72 tokens with CSS names, 24 text styles, a 135-key string catalog in English, Kazakh and Russian, and a prototype with 9 flows.

Still open: Code Connect waits for a codebase, and the brand kit README update needs the kit folder. The Kazakh and Russian copy is a first pass for a native editor; the privacy policy, terms and processing record are drafts, and legal review is out of scope for the hackathon. Product decisions are under Open questions.

How to read IDs: screen IDs carry a dot and follow the phase: 0 set up, 1 check in, 2 write, 3 review. A letter marks an open state or a variant of a screen (0.1a, 2.1w). E.n screens are the Üki Lock flow, where E.1 is the exam office’s rules page; A.n screens are the admin pages. Round 2 adds T.n tablet frames, D.n dark-theme frames and the S.n string catalog; ҚАЗ and РУС mark Kazakh and Russian copies. Story IDs have no dot: A exam office, S student, P proctor, E Üki Lock.

Terms: LMS is the university’s learning management system, where Üki Lock exams run. HUD is the short hint Üki shows the student. KRU is the partner university in the demo data. Pilot means the first real exams after Demo Day; the file sets no date for it.

## At a glance

The Prototype page holds 120 product frames across the four product surfaces and the email, PDFs and shared page they send; no screen gap remains. Most frames are desktop at 1440 × 960 px; T.1 and T.2 show the dashboard at 1024 × 768. The landing site adds a 390 px mobile page, Book a pilot with its sent state, a privacy policy and terms of use.

| Surface | Users | Round 1 | Round 2 | Stories |
| --- | --- | --- | --- | --- |
| Web dashboard · exam office | Exam office staff | 11 screens, 5 open states | 23 frames | A1–A10, E1 |
| Web dashboard · proctor | Proctors | 5 screens, 6 open states | 10 frames | P1–P5 |
| Üki desktop app | Students | 8 screens, 1 open state | 29 frames, 16 of them Kazakh, Russian and English copies | S1–S9 |
| Üki Lock browser extension | Students in an LMS exam | 8 screens | 9 frames | E2–E5 |
| Email, PDFs and shared report | Students, exam office, committee | — | 5 frames: invite email, 3 PDFs, shared report | A2, A5, A7, A10 |
| Landing site | Universities | 1 page, 11 sections | 5 frames: mobile page, Book a pilot and its sent state, privacy policy, terms | — |

Exam office and proctor share one web app shell: the same sidebar, top bar and navigation, with a role label. All surfaces share 72 tokens, 24 text styles, 2 effect styles, 93 icons, the mascot and 31 generated images. The dark frames (D.1–D.6) and the tablet frames (T.1, T.2) reuse the same components under the Dark mode and a narrower width.

## Screen map

&#91;embedded content: screen map · 120 product frames by surface and phase, 76 of them added in round 2\]

Tinted boxes are round 2 frames; outlined boxes are round 1. A +n counts the open states or extra frames behind a box, such as 0.9a behind 0.9. The map leaves out the landing pages and the string catalog sheets S.1 and S.2.

## File map

The file has 12 pages: 4 for the product, 2 for components and 6 for brand assets.

| Page | What it holds |
| --- | --- |
| [Design Book](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=0-1) | Brand book in 10 sections, from cover to Demo Day; 08 Handoff adds event names, windows and breakpoints |
| [Landing](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=114-2039) | Marketing site: the 1440 px page in 11 sections, a 390 px mobile page, Book a pilot with its sent state, privacy policy and terms of use |
| [Prototype](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=38-2040) | 120 product frames and 2 string-catalog sheets in 11 sections, 9 flows |
| [User stories](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=112-2039) | 29 stories by role and phase; each card lists its screens and the round 2 frames |
| [App parts](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=38-2042) | 66 product components |
| [Book parts](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=8-2) | 12 components: button, chip, toggle, live widget, HUD, tiles, timer, book layout |
| [Logo](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=1-59) | Wordmark, mark, app icon, menu bar icon |
| [Mascot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=3-24) | 22 poses |
| [Faces](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=4-123) | 12 face states for the widget |
| [Stickers](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=3-47) | 22 sticker poses |
| [Icons](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=1-63) | 93 icons |
| [Backgrounds](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=29-2005) | 31 generated images |

Read [08 Handoff](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=21-1939) first. It maps tokens to CSS variables and events to mascot faces, and lists timings, radii and spacing.

Design Book sections: [00 Cover](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=9-3) · [01 Brand](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=10-47) · [02 Mascot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=12-140) · [03 Color](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=13-1169) · [04 Type](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=14-1179) · [05 Components](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=16-1187) · [06 Product](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=17-1570) · [07 Voice](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=20-1935) · [08 Handoff](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=21-1939) · [09 Demo Day](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=32-2018)

## Screen inventory

The Prototype page holds 120 product frames in 11 sections, each opening with a 440 px card. The first table lists the 44 round 1 frames; the round 2 tables after it list the other 76. Most frames are 1440 × 960 px; T.1 and T.2 are 1024 × 768. Surface: Office = exam office dashboard, Proctor = proctor dashboard, App = Üki desktop app, Lock = Üki Lock in the browser, Output = email, PDF or shared page.

| ID | Screen | Surface | What it shows | Stories |
| --- | --- | --- | --- | --- |
| [0.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2046) | Exams overview | Office | Next, live and review counts; 0 MB video; exams table; next-exam card | A4 |
| [0.1a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=84-5214) | Notifications | Office | Bell list: flags, starts, unopened invites | A4 |
| [0.1b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=84-5341) | Why 0 MB | Office | Info card: what is sent instead of video | A6 |
| [0.1c](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=84-5436) | Faculty switcher | Office | Workspace menu with faculties | A4 |
| [0.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2048) | New exam · Checks (step 2 of 3) | Office | Six checks with reasons, gaze and phone thresholds, student preview | A1 |
| [0.2a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=85-6315) | Gaze threshold info | Office | Info card for the 2 s threshold | A1 |
| [0.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2050) | New exam · Roster and proctors (step 3) | Office | Imported CSV, proctor seats and languages, invite status per student | A2, A3 |
| [E.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=99-10209) | Browser rules | Office | Where the exam runs, exam link, allowed sites, six lock rules, student preview | E1 |
| [1.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2058) | Join | App | Exam code and student ID fields, ҚАЗ · РУС · ENG switch | S1 |
| [1.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2060) | System check | App | Local camera preview, seven checks including network and Üki version, one failing (Telegram open) | S2 |
| [1.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2062) | Identity | App | Card frame; face, card and one-person checks | S3 |
| [1.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2064) | Rules and lobby, in Kazakh | App | Four rules, consent, countdown to the start | S4 |
| [1.4a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=87-8156) | Rules · question open | App | “Where is the video?” answered in place | S4 |
| [1.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2066) | Lobby | Proctor | Joined, ready, need help, not joined; check-in table; Start exam | P1 |
| [1.5a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=85-6412) | Lobby · student card | Proctor | Hover card: step, problem, device | P1, S3 |
| [2.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2074) | Exam | App | Question 7 of 20, saved on the laptop, status widget, session log, Ask proctor | S5 |
| [2.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2076) | Phone warning | App | Warning, flag in the log, exam continues | S6 |
| [2.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2078) | Paused | App | No face, timer stopped, “I’m here” button | S7 |
| [2.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2080) | Live wall, dark | Proctor | 125 tiles sorted by flags, counts, live events, message and extend | P2 |
| [2.4a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=85-6504) | Student actions | Proctor | Tile menu: timeline, camera, message, pause, end | P2 |
| [2.4b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=85-6635) | Quick message | Proctor | Preset messages to a student or the group | P3 |
| [2.4c](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=85-6750) | Extend time | Proctor | Add minutes for one student or all | P3 |
| [2.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2082) | Student timeline, dark | Proctor | Drawer over the wall: frame and events | P4 |
| [3.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2090) | Submitted | App | Receipt ID, time used, flag count, Close Üki | S8, S9 |
| [3.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2092) | Review queue | Proctor | Review stats, “Flag ≠ fail” note, sessions table | P5 |
| [3.2a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=87-8275) | Flag type filter | Proctor | Filter menu by flag type | P5 |
| [3.2b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=87-8524) | Flag preview | Proctor | Hover preview of a flagged frame | P5 |
| [3.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2094) | Session review | Proctor | Frames, timeline, three decisions, note | P5, S9 |
| [3.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2096) | Integrity report | Office | Flags, decision, PDF and CSV export, 7-day share link, data kept | A5, A6 |
| [3.4a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=87-8591) | Account menu | Office | User menu | A5 |
| [E.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=95-9044) | Get Üki Lock | Lock | Install page get.uki.test/lock, three steps | E2 |
| [E.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=95-9192) | Pair with the app | Lock | Popup and app show the same 6-digit code | E2 |
| [E.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=97-9304) | Ready to lock | Lock | LMS quiz page; popup lists what will close; Lock and start | E3 |
| [E.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=97-9529) | Locked exam | Lock | Lock bar with time, calculator tab and Ask proctor; LMS quiz | E4 |
| [E.6](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=98-9620) | Copy blocked | Lock | Toast: “Copy is off during the exam.” | E4 |
| [E.7](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=98-9737) | Site closed | Lock | Block page for a closed site, Back to the exam | E4 |
| [E.8](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=98-9927) | Lock status | Lock | Popup: time left, open sites, 3 noted attempts | E4 |
| [E.9](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=98-10081) | Lock released | Lock | Tabs back, blocked-attempt summary | E5 |
| [A.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=102-10454) | Reports | Office | Term KPIs, weekly flag rate, flag types, decisions, review time | A7 |
| [A.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=104-10579) | Students | Office | 1,284 students, readiness counts, table with status | A8 |
| [A.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=105-10746) | Student profile | Office | Exam history, devices, consent, data kept | A8 |
| [A.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=106-10905) | Settings | Office | Exam defaults, default checks, integrations, team | A9 |
| [A.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=107-11102) | Privacy centre | Office | Data map, recent access, retention, requests | A10 |
| [A.6](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=108-11296) | Audit log | Office | Filtered log, no edits, CSV export | A10 |

### Round 2 · Demo Day additions (16)

Section [Additions · Demo Day](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=151-11477). Round 2 also changed three round 1 frames in place: 1.1 gained the student ID field, 1.2 the network and Üki version rows, and 2.1–2.3 an Ask proctor button.

| ID | Screen | Surface | What it shows | Stories |
| --- | --- | --- | --- | --- |
| [1.1a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=151-11483) | Join · wrong code | App | “Check the code.” error with the code format MATH2-204-FRI | S1 |
| [1.3a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=151-11547) | Identity · proctor help | App | After 3 failed card reads the proctor joins the check | S3 |
| [1.5b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=156-12176) | Lobby · identity help | Proctor | Need help list with the failed check and Send hint | S3, P1 |
| [0.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=158-12473) | New exam · details (step 1) | Office | Title, course, type, groups, date, time, where it runs; at-a-glance card | A1 |
| [0.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=159-12771) | New exam · review | Office | Summary before scheduling; test invite, Save draft, Schedule exam | A1 |
| [0.3a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=160-12932) | New exam · roster errors | Office | 124 of 128 rows valid; each bad row says what to fix | A2 |
| [0.3b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=160-13301) | Roster · fix email | Office | Fix a bounced invite email in place | A2 |
| [0.8](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=161-13438) | Invite email | Output | Exam code, student ID, install link, lobby time, in three languages | A2, S1 |
| [0.9](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=164-13518) | My exams | Proctor | Proctor home: today’s exams and the seats to confirm | P1 |
| [0.9a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=164-15836) | Confirm seats | Proctor | Seats 65–128, languages, lobby time; confirm or ask for a change | A3 |
| [3.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=162-13464) | Shared report | Output | Read-only report behind the 7-day committee link | A5 |
| [A.5a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=165-14035) | Privacy · delete request | Office | What gets deleted; delete or reply with a reason | A10 |
| [A.5b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=165-16241) | Privacy · copy request | Office | Data copy sent as a secure link | A10 |
| [E.5a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=152-11597) | Locked exam · Ask proctor | Lock | Ask your proctor sheet over the LMS quiz | E4 |
| [E.5b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=153-11724) | Locked exam · calculator | Lock | Calculator built into Üki Lock; works offline, keeps no history | E4 |
| [2.4d](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=155-11803) | Live wall · Ask proctor requests | Proctor | Requests tab with Reply and Mark done | E4, P2 |

### Round 2 · Languages (16 frames and 2 string sheets)

Section [Languages · ҚАЗ and РУС](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-14436). Every student app screen now exists in Kazakh, Russian and English.

| Frames | What they show |
| --- | --- |
| ҚАЗ: [1.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-14442) · [1.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-14498) · [1.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-14650) · [2.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-14760) · [2.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-14881) · [2.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-15018) · [3.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-15198) | The student flow in Kazakh; 1.4 was already in Kazakh |
| РУС: [1.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15108) · [1.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15164) · [1.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15316) · [1.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15426) · [2.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15535) · [2.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15656) · [2.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15793) · [3.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=168-15973) | The student flow in Russian |
| ENG: [1.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-15278) | Rules and lobby in English |
| [S.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=171-15780) · [S.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=172-15868) | String catalog: 135 keys with the English source, Kazakh, Russian and notes on plurals, length and data values |

### Round 2 · Pilot additions (28)

Section [Additions · Pilot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=177-15940).

| ID | Screen | Surface | What it shows | Stories |
| --- | --- | --- | --- | --- |
| [A.0](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=177-15946) | Sign in | Office | Work email and password, Keep me signed in for 12 hours, Forgot password | — |
| [A.0a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=178-15993) | Reset password | Office | Link sent, valid 30 minutes, Resend in 0:45 | — |
| [A.0b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=178-16097) | Accept invite | Proctor | Name and password from the exam office’s invite | A9 |
| [1.0](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=179-16092) | Get Üki | App | Download page: download, open the installer, enter the exam code | S1 |
| [1.0a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=179-16204) | Camera permission | App | macOS camera prompt over the system check, and the fix after Don’t Allow | S2 |
| [1.0b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=179-16419) | Update required | App | Needs 1.4.0 or later; download progress; Restart and update keeps the code | S1 |
| [2.1a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=180-18130) | Offline | App | Keep writing; answers save on the laptop and sync later; the timer runs | S5 |
| [2.1b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=180-18277) | Time up | App | Answers handed in at 00:00; See receipt | S8 |
| [2.1c](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=180-18517) | Paused by proctor | App | Timer held while the student waits for the proctor | S7 |
| [2.1d](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=181-16655) | Ended by proctor | App | End time, receipt and where to appeal | S8 |
| [2.1w](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=181-16748) | Exam on Windows | App | 2.1 in the Windows title bar | S5 |
| [2.4e](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=181-18746) | End session dialog | Proctor | End one student’s exam, with a reason | P2 |
| [E.3a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=183-17178) | Pairing failed | Lock | Üki app not found after 30 s; open the app, then Try again | E2 |
| [E.5c](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=183-17362) | App disconnected | Lock | The Üki app closed; the exam stays locked; Open Üki | E4 |
| [E.5d](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=183-17519) | Full-screen exit | Lock | Leaving full screen is logged; Return to full screen | E4 |
| [E.5f](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=223-21424) | Paused by proctor | Lock | The proctor’s note over the locked quiz | E4 |
| [E.10](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=184-19277) | Store screenshot | Lock | 1280 × 800 store listing screenshot | E2 |
| [E.10a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=185-17572) | Store tiles and icon | Lock | 440 × 280 tile, 1400 × 560 marquee, icon sizes, listing copy and permissions | E2 |
| [0.1d](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=186-17756) | Overview · empty | Office | No exams yet: import students, invite proctors, New exam | A4 |
| [0.1e](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=186-18213) | Overview · loading | Office | Skeleton rows while exams load | A4 |
| [3.2c](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=186-18635) | Review · queue clear | Proctor | Every flag has a decision; Open report | P5 |
| [A.2a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=186-19001) | Students · error | Office | Couldn’t load students; Try again; an error code for support | A8 |
| [0.6](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=187-18518) | Exam detail | Office | Readiness counts, Remind 27 students, Edit, Open lobby, tabs | A4 |
| [0.6a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=223-21571) | Exam detail · more | Office | Duplicate, copy invite text, move date, cancel exam | A4 |
| [0.7](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=188-18680) | Question bank | Office | 48 questions, import QTI or Moodle XML, editor with a student preview | A1 |
| [3.4b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=189-18855) | Report PDF | Output | Integrity report, A4, 2 pages, with a verify code | A5 |
| [A.1a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=232-21680) | Term report PDF | Output | Term KPIs, weekly flags, decisions and flag types, A4, 2 pages | A7 |
| [A.5c](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=190-18865) | Processing record PDF | Output | Purpose, legal basis, data map, retention, security, requests | A10 |

### Round 2 · After pilot additions (16)

Section [Additions · After pilot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=199-18877).

| ID | Screen | Surface | What it shows | Stories |
| --- | --- | --- | --- | --- |
| [2.1e](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=199-18883) | Message and new end time | App | Proctor message: 10 more minutes, the exam now ends at 11:40 | P3 |
| [E.5e](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=199-19019) | Message and new end time | Lock | Proctor message over the locked quiz; Reply, Got it | P3 |
| [A.4a](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=200-19071) | Invite proctors | Office | Invite dialog over Team and roles; Send 2 invites | A9 |
| [A.4b](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=201-19297) | Team and roles | Office | Members, roles and what each role can do | A9 |
| [A.4c](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=202-19464) | Single sign-on | Office | Microsoft Entra ID, Google Workspace or SAML 2.0; attribute mapping; Test sign-in | A9 |
| [A.4d](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=203-19629) | Integrations | Office | LMS webhooks with events, signing secret and deliveries; scheduled roster import | A9 |
| [A.7](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=204-19795) | Notifications | Office | All, flags, requests and system; Mark all as read | A4 |
| [A.8](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=206-19948) | Search | Office | Results for a name over the Students page | A8 |
| [T.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=207-20258) | Overview · tablet | Office | 0.1 at 1024 × 768 with the 72 px icon rail | A4 |
| [T.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=207-20432) | Live wall · tablet | Proctor | 2.4 at 1024 × 768 | P2 |
| [D.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=208-20590) | Overview · dark | Office | 0.1 in the Dark mode | A4 |
| [D.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=208-20942) | Live wall · dark | Proctor | 2.4, which already ships dark, kept in the dark set | P2 |
| [D.3](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=208-21354) | Session review · dark | Proctor | 3.3 in the Dark mode | P5 |
| [D.4](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=208-21586) | Reports · dark | Office | A.1 in the Dark mode | A7 |
| [D.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=208-21848) | System check · dark | App | 1.2 in the Dark mode | S2 |
| [D.6](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=208-21998) | Exam · dark | App | 2.1 in the Dark mode | S5 |

### Landing additions (5)

The [Landing page](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=114-2039) gained five frames next to the desktop page.

| Frame | What it shows |
| --- | --- |
| [Mobile 390](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=192-3586) | The landing page at 390 px in 10 sections, without the desktop feature grid |
| [Book a pilot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=194-4014) | The pilot plan, weeks 0–3, and the request form |
| [Book a pilot · sent](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=195-4090) | Confirmation after the request |
| [Privacy policy](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=196-4125) | Policy with an on-page index |
| [Terms of use](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=197-4144) | Terms with an on-page index |

## Design tokens

All 72 variables have a CSS name in Figma’s code syntax and a set scope; none uses “all scopes”. Colour follows the theme: Light by default, Dark under `[data-theme=dark]` (08 Handoff). Round 2 added 21: the primitives paper/200, ink/600, coral/600 and coral/700; 14 colour tokens for hover, pressed, focus, danger, glass and error text; and space/20, space/120 and space/160.

### Colour · semantic (34)

| Token | CSS variable | Light | Dark |
| --- | --- | --- | --- |
| bg/canvas | `--uki-bg-canvas` | #F6F5F1 | #121310 |
| bg/surface | `--uki-bg-surface` | #FFFFFF | #1C1D19 |
| bg/subtle | `--uki-bg-subtle` | #ECEAE3 | #2A2B26 |
| bg/brand | `--uki-bg-brand` | #BCE33C | #BCE33C |
| bg/brand-subtle | `--uki-bg-brand-subtle` | #E6F5A8 | #4A650C |
| bg/inverse | `--uki-bg-inverse` | #121310 | #F6F5F1 |
| bg/hover | `--uki-bg-hover` | #ECEAE3 | #2A2B26 |
| bg/pressed | `--uki-bg-pressed` | #E3E0D7 | #34352F |
| bg/inverse-hover | `--uki-bg-inverse-hover` | #2A2B26 | #ECEAE3 |
| bg/inverse-pressed | `--uki-bg-inverse-pressed` | #0E0E0D | #E3E0D7 |
| bg/brand-hover | `--uki-bg-brand-hover` | #D3EE78 | #D3EE78 |
| bg/brand-pressed | `--uki-bg-brand-pressed` | #A6CF2A | #A6CF2A |
| bg/danger | `--uki-bg-danger` | #EA4E3D | #EA4E3D |
| bg/danger-hover | `--uki-bg-danger-hover` | #D2412F | #D2412F |
| bg/danger-pressed | `--uki-bg-danger-pressed` | #B23526 | #B23526 |
| bg/glass | `--uki-bg-glass` | #FFFFFF at 8% | #FFFFFF at 8% |
| text/primary | `--uki-text-primary` | #0E0E0D | #F6F5F1 |
| text/on-brand | `--uki-text-on-brand` | #0E0E0D | #0E0E0D |
| text/accent | `--uki-text-accent` | #4A650C | #BCE33C |
| text/inverse | `--uki-text-inverse` | #F6F5F1 | #0E0E0D |
| text/danger | `--uki-text-danger` | #B23526 | #EA4E3D |
| border/default | `--uki-border-default` | #ECEAE3 | #2A2B26 |
| border/strong | `--uki-border-strong` | #0E0E0D | #F6F5F1 |
| border/focus | `--uki-border-focus` | #6B9112 | #BCE33C |
| border/focus-ring | `--uki-border-focus-ring` | #D3EE78 | #4A650C |
| border/glass | `--uki-border-glass` | #FFFFFF at 18% | #FFFFFF at 18% |
| icon/primary | `--uki-icon-primary` | #0E0E0D | #F6F5F1 |
| icon/accent | `--uki-icon-accent` | #4A650C | #BCE33C |
| status/ok | `--uki-status-ok` | #8AB71A | #8AB71A |
| status/warn | `--uki-status-warn` | #F5C945 | #F5C945 |
| status/flag | `--uki-status-flag` | #EA4E3D | #EA4E3D |
| status/ok-subtle | `--uki-status-ok-subtle` | #E3EACA | #303919 |
| status/warn-subtle | `--uki-status-warn-subtle` | #F6EDD2 | #433C21 |
| status/flag-subtle | `--uki-status-flag-subtle` | #F4DED8 | #39241E |

The three subtle status tokens and the two glass tokens hold raw values; the other 29 alias primitives.

### Colour · primitives (20)

| Token | CSS variable | Hex |
| --- | --- | --- |
| lime/200 | `--uki-lime-200` | #E6F5A8 |
| lime/300 | `--uki-lime-300` | #D3EE78 |
| lime/400 | `--uki-lime-400` | #BCE33C |
| lime/500 | `--uki-lime-500` | #A6CF2A |
| moss/600 | `--uki-moss-600` | #8AB71A |
| moss/700 | `--uki-moss-700` | #6B9112 |
| moss/800 | `--uki-moss-800` | #4A650C |
| ink/950 | `--uki-ink-950` | #0E0E0D |
| ink/900 | `--uki-ink-900` | #121310 |
| ink/800 | `--uki-ink-800` | #1C1D19 |
| ink/700 | `--uki-ink-700` | #2A2B26 |
| ink/600 | `--uki-ink-600` | #34352F |
| paper/50 | `--uki-paper-50` | #F6F5F1 |
| paper/100 | `--uki-paper-100` | #ECEAE3 |
| paper/200 | `--uki-paper-200` | #E3E0D7 |
| white | `--uki-white` | #FFFFFF |
| yellow/400 | `--uki-warn` | #F5C945 |
| coral/500 | `--uki-flag` | #EA4E3D |
| coral/600 | `--uki-coral-600` | #D2412F |
| coral/700 | `--uki-coral-700` | #B23526 |

### Spacing and radius (18)

| Token | CSS variable | Value (px) |
| --- | --- | --- |
| space/4 | `--uki-space-4` | 4 |
| space/8 | `--uki-space-8` | 8 |
| space/12 | `--uki-space-12` | 12 |
| space/16 | `--uki-space-16` | 16 |
| space/20 | `--uki-space-20` | 20 |
| space/24 | `--uki-space-24` | 24 |
| space/32 | `--uki-space-32` | 32 |
| space/48 | `--uki-space-48` | 48 |
| space/64 | `--uki-space-64` | 64 |
| space/96 | `--uki-space-96` | 96 |
| space/120 | `--uki-space-120` | 120 |
| space/128 | `--uki-space-128` | 128 |
| space/160 | `--uki-space-160` | 160 |
| radius/sm | `--uki-radius-sm` | 12 |
| radius/md | `--uki-radius-md` | 16 |
| radius/card | `--uki-radius-card` | 24 |
| radius/xl | `--uki-radius-xl` | 32 |
| radius/pill | `--uki-radius-pill` | 999 |

08 Handoff assigns radii by part: controls 12, cards 24, book cards 32, buttons and chips pill. Base unit is 4 px; card padding is 24–32 px. The 20 px grid gap and the 120 and 160 px section padding in 08 Handoff now have tokens: space/20, space/120 and space/160.

### Text styles (24)

Fonts: Geist and Geist Mono.

| Style | Font | Size (px) / line height | Tracking |
| --- | --- | --- | --- |
| Display/XL | Geist Bold | 120 / 100% | −4% |
| Display/L | Geist Bold | 96 / 100% | −4% |
| Display/M | Geist Bold | 80 / 96% | −4.5% |
| Heading/H1 | Geist Bold | 64 / 105% | −3.5% |
| Heading/H2 | Geist Bold | 48 / 110% | −3% |
| Heading/H3 | Geist SemiBold | 32 / 120% | −2% |
| Body/L | Geist Regular | 24 / 150% | −0.5% |
| Body/M | Geist Regular | 18 / 150% | 0 |
| Body/S | Geist Regular | 15 / 150% | 0 |
| Label/M | Geist Medium | 15 / 130% | 0 |
| Label/M Strong | Geist SemiBold | 15 / 130% | −0.5% |
| Card/Title | Geist SemiBold | 17 / 130% | −0.5% |
| Card/Caption | Geist Regular | 14 / 145% | 0 |
| UI/Title | Geist SemiBold | 26 / 120% | −1.5% |
| UI/Label | Geist Medium | 13 / 130% | 0 |
| UI/Caption | Geist Regular | 12 / 140% | 0 |
| UI/Mono | Geist Mono Regular | 12 / 140% | 0 |
| Mono/M | Geist Mono Regular | 18 / 160% | 0 |
| Mono/S | Geist Mono Regular | 13 / 140% | 0 |
| Mono/Overline | Geist Mono Medium | 13 / 130% | 6%, uppercase |
| Mono/Tag | Geist Mono Medium | 11 / 120% | 6%, uppercase |
| Mono/Display L | Geist Mono Regular | 44 / 100% | −3% |
| Mono/Display M | Geist Mono Medium | 36 / auto | 0 |
| Mono/Code | Geist Mono Medium | 34 / auto | 8% |

### Effects (2)

Shadow/Float: `0 14px 36px rgba(13, 15, 8, 0.14), 0 2px 6px rgba(13, 15, 8, 0.08)`.

Focus/Ring: `0 0 0 4px #D3EE78`, the keyboard focus ring on the Button and Input focus states. In code, take its colour from border/focus-ring so it follows the theme.

## Components

78 components: 66 on App parts and 12 on Book parts, grouped below by job; the 17 marked (new) were added in round 2. Button has Default, Hover, Pressed, Focus and Loading states in every style, plus Danger and Disabled; Input and Text area have Default, Focus, Error and Disabled. App/Title bar and Browser/Top bar switch between macOS and Windows. Icons swap in through Icon properties; brand components are under Brand and media assets.

### Shell and navigation (7)

| Component | Variants | Properties |
| --- | --- | --- |
| [App/Sidebar](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=47-2070) | — | Role, User name, User role |
| [App/Top bar](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=47-2201) | — | Title, Breadcrumb |
| [App/Title bar](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=150-13352) | OS: macOS, Windows (window buttons, language switch, Üki face) | Title |
| [Browser/Top bar](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=150-13406) | OS: macOS, Windows | Tab title, URL, Show other tabs |
| [Nav item](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=40-2055) | State: Default, Active | Label, Show count, Icon |
| [Tab](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=40-2060) | State: Default, Active | Label |
| [Step](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=46-2106) | State: Done, Current, Upcoming | Number, Label |

### Inputs and controls (14)

| Component | Variants | Properties |
| --- | --- | --- |
| [Button](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=8-37) (Book parts) | Style: Primary, Brand, Secondary, Ghost, Danger, each in State: Default, Hover, Pressed, Focus, Loading; plus Disabled (26 variants) | Label |
| [Icon button](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=45-2059) | — | Icon |
| [Input](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=142-13172) | State: Default, Focus, Error, Disabled | Label, Value, Helper, Show helper, Show trailing icon, Trailing icon |
| [Text area](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=143-13134) (new) | State: Default, Focus, Error, Disabled | Label, Value, Helper, Show helper, Show trailing icon, Trailing icon |
| [Search field](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=45-2054) | — | Placeholder |
| [Select](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=79-2410) | State: Closed, Open | Label, Value, Icon |
| [Popover/Date picker](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=147-2727) (new) | — | — |
| [File upload](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=148-2805) (new) | State: Empty, Uploading, Valid, Errors | — |
| [Checkbox](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=49-2176) | Checked: true, false | Label |
| [Radio option](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=49-2188) | Selected: true, false | Title, Detail |
| [Toggle](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=15-1314) (Book parts) | On: true, false | — |
| [Toggle row](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=45-2062) | — | Title, Description, Icon |
| [Disclosure](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=79-2431) | State: Collapsed, Expanded | Title, Body, Icon, Show icon |
| [Focus order](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=145-2773) (new) | — | Number; a handoff marker for keyboard order |

### Data display (23)

| Component | Variants | Properties |
| --- | --- | --- |
| [Avatar](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=39-2045) | Tone: Lime, Paper, Ink | Initials |
| [Count](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=39-2054) | Tone: Neutral, Flag, Warn, Brand | Count |
| [Badge](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=89-2454) | Tone: Brand, Ink, Neutral, Warn, Ok | Label |
| [Chip](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=8-26) (Book parts) | Status: ok, warn, flag, idle | Label |
| [Stat tile](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=40-2061) | — | Label, Value, Caption |
| [Row/Exam](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=50-2153) | — | Exam, Exam detail, When, Duration, Students, Check Lock, Check Gaze, Check Phone, Check ID |
| [Row/Session](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=50-2191) | — | Name, Student ID, Top flag, Duration, Action |
| [Row/Lobby](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=50-2214) | — | Name, Student ID, Step, Step detail, Device, Action |
| [Check row](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=46-2089) | Status: Pass, Fail, Running | Title, Detail |
| [Event row](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=46-2165) | Kind: Info, Ok, Warn, Flag | Time, Title, Detail |
| [Evidence card](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=46-2166) | — | Time, Title, Detail |
| [Student tile](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=15-1372) (Book parts) | State: ok, warn, flag, paused | Name, Detail |
| [Camera tile](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=15-1373) (Book parts) | — | — |
| [Timer](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=15-1304) (Book parts) | — | — |
| [Table/Header cell](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=149-2763) (new) | Sort: None, Asc, Desc | Label |
| [Table/Pagination](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=149-2764) (new) | — | — |
| [Table/Empty state](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=149-2792) (new) | — | Title, Body, Show action |
| [Table/Skeleton row](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=149-2847) (new) | — | — |
| [Chart/Line](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=150-2809) (new) | — | — |
| [Chart/Bars](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=150-2833) (new) | — | — |
| [Chart/Donut](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=150-2868) (new) | — | — |
| [Chart/Legend item](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=150-2864) (new) | — | Label, Value |
| [Chart/Tooltip](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=150-2889) (new) | — | Date, Value |

### Student status (2, Book parts)

| Component | Variants | Properties |
| --- | --- | --- |
| [Widget/Live](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=15-1264) | State: Watching, Looked away, Phone, Paused, Submitted | — |
| [HUD](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=15-1303) | Kind: Gaze, Phone, Tab | — |

### Menus, popovers, dialogs and feedback (18)

| Component | Variants | Properties |
| --- | --- | --- |
| [Menu item](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=71-2207) | State: Default, Hover, Selected, Danger | Label, Meta, Show meta, Icon |
| [Menu header](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=71-2208) | — | Label |
| [Menu separator](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=71-2210) | — | — |
| [Menu/User](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=75-2309) | — | Name, Role |
| [Menu/Workspace](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=83-2391) | — | — |
| [Menu/Tile actions](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=75-2198) | — | — |
| [Menu/Quick message](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=75-2259) | — | — |
| [Dropdown/Filter](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=76-2284) | — | — |
| [Popover/Info](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=76-2333) | — | Title, Body, Show rows, 3 key–value rows, Link, Show link |
| [Popover/Student](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=77-2318) | — | Name, ID, Step, Step meta, 3 facts |
| [Popover/Notifications](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=77-2357) | — | — |
| [Popover/Flag preview](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=71-2212) | — | Title, Detail, Time, Link |
| [Popover/Extend time](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=83-2462) | — | — |
| [Tooltip](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=79-2411) | — | Text, Shortcut, Show shortcut |
| [Dialog](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=144-2725) (new) | Tone: Default, Danger | Title, Body, Show field |
| [Toast](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=145-2732) (new) | Kind: Success, Info, Error, Progress | Message, Action, Show action |
| [Banner](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=145-2770) (new) | Kind: Info, Warn, Error, Offline | Title, Body, Show action |
| [Spinner](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=145-2771) (new) | — | — |

### Üki Lock extension (10)

| Component | Variants | Properties |
| --- | --- | --- |
| [Ext/Toolbar icon](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=89-2491) | State: Off, Ready, Locked | — |
| [Ext/Popup header](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=92-2533) | — | — |
| [Ext/Popup footer](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=92-2546) | — | Text, Show dot |
| [Ext/Popup · Pair](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=92-2552) | — | — |
| [Ext/Popup · Ready](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=92-2592) | — | — |
| [Ext/Popup · Locked](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=93-2626) | — | — |
| [Ext/Popup · Released](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=93-2688) | — | — |
| [Ext/Check](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=92-9352) | Status: Pass, Wait, Fail | Title, Detail |
| [Ext/Toast](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=89-2492) | — | Text, Time, Icon |
| [Ext/Lock bar](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=90-2549) | — (dark theme) | Exam, Time, Tab 1, Tab 2, Show tab 2 |

### Book layout (4, Design Book only)

| Component | Variants | Properties |
| --- | --- | --- |
| [Book/Header](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=8-4) | — | Overline, Title, Lead |
| [Book/Label](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=8-9) | — | Title, Caption |
| [Book/Label tagged](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=11-140) | — | Title, Tag, Caption |
| [Tag](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=8-12) | — | Tag |

## Brand and media assets

Figma holds the logo set, 56 mascot and face variants, 83 icons and 31 generated images. The motion files sit in the brand kit, outside Figma.

### Brand components

| Component | Variants | Size (px) |
| --- | --- | --- |
| [Wordmark](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=6-21) | Theme: Ink, Paper | 760 × 320 |
| [Mark](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=6-27) | — | 160 × 160 |
| [App icon](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=6-37) | — | 160 × 160 |
| [Menu bar icon](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=6-43) | — | 22 × 22 |
| [Mascot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=3-24) | 22 poses: master, hello, standing, laptop, writing, id-check, lock, shield, alert, no-phone, magnifier, thinking, report, approve, celebrating, graduate, privacy, oops, sleeping, pointing, sign, peeking | 480 × 480 |
| [Mascot Sticker](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=3-47) | The same 22 poses as stickers | 480 × 480 |
| [Face](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=4-123) | 12 states: neutral, happy, alert, flag, sleeping, thinking, oops, wink, look-left, look-right, look-up, look-down | 160 × 160 |

### Icons (93)

All 24 × 24 px, 2 px stroke with round caps, coloured by icon/primary ([Icons page](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=1-63)). Names: gaze, gaze-away, eyes, camera, face-scan, id-card, phone, phone-off, browser-lock, tab-switch, lock, shield, exam, timer, report, flag, alert, check, pause, offline, mic, screen, user, users, settings, layout-grid, calendar, upload, download, search, filter, bell, log-out, plus, more, chevron-right, chevron-down, arrow-right, external-link, eye-off, play, stop, refresh, copy, globe, chip, message, edit, history, info, help, puzzle, link, key, unlock, clipboard, printer, keyboard, app-window, wifi, hand, code, bar-chart, trend-up, pie-chart, database, archive, trash, file-text, building, sliders, list-check, user-plus, mail, moon, sun, plug, shield-check, graduation-cap, cloud-off, laptop, chevron-left, chevron-up, close, calculator, arrow-up, arrow-down, sort, send, minus, square, inbox, menu.

### Generated images (31)

| Group | Layer names | Placed at (px) |
| --- | --- | --- |
| [Backgrounds and scenes](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=29-2011) (8) | uki-bg-aurora-ink, uki-bg-moss-night, uki-bg-lens, uki-bg-mist, uki-bg-glass, uki-scene-desk, uki-bg-lime-band, uki-webcam-frame | 590 × 393; lime band 1200 × 450 |
| [3D icons](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=43-2069) (8) | uki-3d-eye, uki-3d-browser-lock, uki-3d-phone-scan, uki-3d-laptop-shield, uki-3d-report, uki-3d-id-scan, uki-3d-stopwatch, uki-3d-webcam | 245 × 200 |
| [3D shapes](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=43-2114) (6) | uki-3d-glass-pill, uki-3d-sphere, uki-3d-glass-ring, uki-3d-half-sphere, uki-3d-glass-cube, uki-3d-capsule | 346 × 220 |
| [Evidence stills](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=43-2143) (6) | uki-evidence-normal, uki-evidence-looked-away, uki-evidence-phone, uki-evidence-second-person, uki-evidence-empty-seat, uki-evidence-looking-down | 346 × 300 |
| [Photos](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=43-2178) (2) | uki-photo-lab, uki-photo-lecturer | 550 × 393 |
| [Face animation preview](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=35-2047) (1) | uki-face-animated (GIF) | 264 × 264 |

All 31 were generated with ChatGPT; the people in them are not real students. The evidence stills can stand in for flagged frames in demo data.

### Motion

The animated face ships as uki-face-animated.svg (CSS animation), uki-face.json (Lottie) and a GIF. These files sit in the brand kit folder `qostanai/brand` on Kassymzhomart’s Mac, not in Figma; the team needs a shared copy. The kit README and prompt list do not yet cover the second image batch (3D icons, shapes, evidence stills, photos).

## Prototype behaviour

The prototype has 9 flows and 531 interactions: 516 clicks, 14 key presses and 1 timer. Most transitions are 150–200 ms ease-out dissolves. Three behaviours need more than page links:

- Ctrl+T or Cmd+T on E.5 and on its round 2 states E.5a–E.5f opens the block page, E.7.
- E.6 returns to the exam after 2.5 s.
- The timeline drawer slides over the live wall (smart animate, 300 ms ease-in-out).

| Flow | Starts at | Path |
| --- | --- | --- |
| 1 · Exam office: set up an exam | [0.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2046) | 0.1 → New exam → 0.4 → Next: checks → 0.2 → Next → 0.3 → Next: review → 0.5 → Schedule exam → 0.1; Open lobby → 1.5. From 0.1: an exam row → 0.6 → More → 0.6a, Questions → 0.7; search → A.8. 0.3a → Edit → 0.3b → Save → 0.3 |
| 2 · Student: check in and write | [1.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2058) | 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 3.1 → Close Üki → 1.1. The exam code field on 1.1 → 1.1a → Continue → 1.2; Ask proctor on 1.3 → 1.3a |
| 3 · Proctor: lobby, live wall, review | [1.5](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=51-2066) | 1.5 → Start exam → 2.4 → a tile → 2.5 → close → 2.4; 3.2 → a session → 3.3 → 3.4. Need help on 1.5 → 1.5b; End session in the tile menu → 2.4e → 2.4 |
| 4 · Üki Lock: browser rules | [E.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=99-10209) | E.1 → Test as a student → E.4 |
| 5 · Üki Lock: student in the browser | [E.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=95-9044) | E.2 → Add to browser → E.3 → Pair → E.4 → Lock and start → E.5 → Finish attempt → E.9. From E.5: question text → E.6; Ctrl+T or Cmd+T → E.7; Üki icon → E.8; Ask proctor → E.5a; Calculator → E.5b; each returns to E.5. E.3a → Try again → E.4 |
| 6 · Admin: reports, students, privacy | [A.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=102-10454) | A.2 → a student → A.3; A.5 → Open audit log → A.6. A.1 → Export PDF → A.1a; 3.4 → Download PDF → 3.4b, share link → 3.5; A.4 → Invite a proctor → A.4a → Send 2 invites → A.4b, Team → A.4b, Single sign-on → A.4c, Webhooks → A.4d; A.5 → Delete my data → A.5a, Copy of my data → A.5b, Processing record → A.5c |
| 7 · Sign in, reset, accept invite | [A.0](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=177-15946) | A.0 → Forgot password? → A.0a → Back to sign in → A.0 → Sign in → 0.1. A.0b → Accept and continue → 0.9 |
| 8 · Student: install Üki and fix the laptop | [1.0](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=179-16092) | 1.0 → Download for macOS → 1.0b → Restart and update → 1.1. 1.0a → Allow → 1.2 |
| 9 · Proctor: my exams and seats | [0.9](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=164-13518) | 0.9 → Confirm seats → 0.9a → Confirm seats or Ask for a change → 0.9 |

The sidebar links the dashboard pages: Overview and Exams → 0.1, Live → 2.4, Review → 3.2, Reports → A.1, Students → A.2, Settings → A.4, Privacy → A.5. Each open state opens from its trigger on the parent screen. These round 2 frames have no link into them; open them from the canvas: A.0b, 1.0a, 0.3a, 0.8, 0.1d, 0.1e, 2.1a–2.1e, 2.1w, 2.4d, 3.2c, A.2a, A.7, E.3a, E.5c–E.5f, E.10, E.10a, T.1, T.2 and D.1–D.6.

### Timings and thresholds

Gaze and phone thresholds are editable per exam; the other values are fixed.

| Rule | Value | Where |
| --- | --- | --- |
| Gaze warning | After 2 s off screen; editable per exam | 0.2, A.4, 08 Handoff |
| Phone flag | Confidence ≥ 0.85; editable per exam | 0.2, A.4 |
| Face missing before the sleeping face | Over 10 s | 08 Handoff |
| HUD on screen | 2.5 s | 08 Handoff |
| HUD fade | 200 ms | 08 Handoff |
| Face cross-fade | 150 ms | 08 Handoff |
| Copy-blocked toast | Back to the exam after 2.5 s | E.6 |
| Identity attempts | 3, then a proctor helps | S3, 1.5 |

### Events to faces

08 Handoff names all 25 events in its Event names card: what happened, where it shows, the face it sets, and whether it goes to review (Flag) or stays on the timeline (Log). The student widget, the app’s menu bar icon and the live wall read one event stream. The HUD shows three of them: gaze.off\_screen “Eyes on the screen”, phone.detected “Phone in frame” and tab.blocked “Other tabs stay closed”.

| Event | What happened | Shown on | Face | Review |
| --- | --- | --- | --- | --- |
| gaze.on\_screen | Eyes back on the screen | 2.1 | neutral | — |
| gaze.off\_screen | Looked away for more than 2 s | 2.4, 3.3 | alert | Flag |
| gaze.down | Looked down for more than 2 s | 3.3, 3.4 | alert | Flag |
| phone.detected | Phone in the frame, with a confidence | 2.2, 2.4, 3.3 | flag | Flag |
| face.missing | No face for more than 10 s | 2.3 | sleeping | Flag |
| face.second | A second face in the frame | 2.4, 3.2 | flag | Flag |
| camera.lost | Camera stopped sending frames | 2.4, 3.2 | sleeping | Flag |
| tab.blocked | Tried to open another tab or app | 2.4, E.8 | thinking | Flag |
| copy.blocked | Copy or paste blocked in Üki Lock | E.6, E.8 | thinking | Log |
| site.closed | A blocked site was closed | E.7, E.8 | thinking | Log |
| net.offline | Network lost, answers wait on the laptop | 2.1a | oops | Log |
| identity.matched | Card and face matched at check-in | 1.3, 2.1 | happy | — |
| exam.started | Exam began on this laptop | 2.1 | neutral | — |
| browser.locked | Browser locked, other tabs closed | 2.1 | neutral | — |
| answer.saved | Answer saved on the laptop | 2.1 | — | — |
| session.paused | Session paused, timer stopped | 2.3 | sleeping | Log |
| exam.submitted | Answers handed in by the student | 3.1 | happy | — |
| exam.time\_up | Time ran out, answers handed in | 2.1b | happy | — |
| proctor.paused | Proctor paused the session | 2.1c, 2.4a | sleeping | Log |
| proctor.ended | Proctor ended the session, with a reason | 2.1d, 2.4e | flag | Flag |
| proctor.time\_added | Proctor added time | 2.1e, E.5e, 2.4c | — | Log |
| proctor.message | Proctor sent a message | 2.1e, E.5e, 2.4b | — | Log |
| student.help\_requested | Student asked the proctor for help | 1.3a, E.5a, 2.4d | thinking | Log |
| lock.app\_disconnected | Üki app closed while Üki Lock was on | E.5c | oops | Flag |
| lock.fullscreen\_exit | Left full screen | E.5d | alert | Log; Flag on the 3rd |

### Gaze mirror

The face moves its two pupils by the measured gaze; nothing else on the face moves (08 Handoff).

```js
// gaze.x, gaze.y in −1 … 1
const k = (eye.r - pupil.r) * 0.92;
pupilL.cx = eyeL.cx + gaze.x * k;
pupilL.cy = eyeL.cy + gaze.y * k;
pupilR.cx = eyeR.cx + gaze.x * k;
pupilR.cy = eyeR.cy + gaze.y * k;
```

## User stories

The [board](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=112-2039) holds 29 stories: 22 MUST (Demo Day scope) and 7 SHOULD (after the pilot). Each card has three acceptance criteria and the screens that cover it; a Round 2 row on the card lists the frames round 2 added, and the last column below repeats them. No story part is left to design. Round 2 also edited 1.1, 1.2 and 2.1–2.3 in place.

| ID | Priority | Story | Screens | Round 2 frames |
| --- | --- | --- | --- | --- |
| A1 | MUST | Turn on only the checks this exam needs | 0.2, 0.2a | 0.4, 0.5, 0.7 |
| A2 | MUST | Import the roster from the dean’s office | 0.3 | 0.3a, 0.3b, 0.8 |
| A3 | MUST | Give each proctor seats and languages | 0.3 | 0.9a |
| A4 | SHOULD | See what is left before exam day | 0.1, 0.1a, 0.1c | 0.1d, 0.1e, 0.6, 0.6a, A.7, T.1, D.1 |
| A5 | MUST | Export a report the committee can trust | 3.4, 3.4a | 3.5, 3.4b |
| A6 | MUST | Prove that video stayed on the laptop | 0.1b, 3.4 | — |
| A7 | SHOULD | Follow the term on one page | A.1 | A.1a, D.4 |
| A8 | SHOULD | Find any student’s history | A.2, A.3 | A.2a, A.8 |
| A9 | SHOULD | Set defaults once | A.4 | A.4a, A.4b, A.4c, A.4d, A.0b |
| A10 | MUST | Answer data requests, show who looked | A.5, A.6 | A.5a, A.5b, A.5c |
| S1 | MUST | Join with the code from my invite | 1.1 | 1.1a, 1.0, 1.0b |
| S2 | MUST | Fix my laptop before the start | 1.2 | 1.0a, D.5 |
| S3 | MUST | Prove it’s me, once | 1.3, 1.5a | 1.3a, 1.5b |
| S4 | MUST | Read the rules in my language | 1.4, 1.4a | 1.4 ENG, 1.4 РУС |
| S5 | MUST | Know Üki is watching, calmly | 2.1 | 2.1a, 2.1w, D.6 |
| S6 | MUST | Get a warning, not a penalty | 2.2 | 2.2 ҚАЗ, 2.2 РУС |
| S7 | SHOULD | Pause when I’m gone, resume when I’m back | 2.3 | 2.1c |
| S8 | MUST | Know my answers are in | 3.1 | 2.1b, 2.1d |
| S9 | SHOULD | Know a flag is not a fail | 3.1, 3.3 | — |
| P1 | MUST | Start on time with everyone in | 1.5, 1.5a | 0.9 |
| P2 | MUST | Watch a whole group on one wall | 2.4, 2.4a | 2.4e, T.2, D.2 |
| P3 | SHOULD | Talk to the group in seconds | 2.4b, 2.4c | 2.1e, E.5e |
| P4 | MUST | Check one student, keep the wall | 2.5 | — |
| P5 | MUST | Review flags fairly and fast | 3.2, 3.2a, 3.2b, 3.3 | 3.2c, D.3 |
| E1 | MUST | Set browser rules for an LMS exam | E.1 | — |
| E2 | MUST | Install and pair once | E.2, E.3 | E.3a, E.10, E.10a |
| E3 | MUST | Lock with one click | E.4 | — |
| E4 | MUST | Stay on the exam, with reasons | E.5–E.8 | E.5a, E.5b, E.5c, E.5d, E.5f, 2.4d |
| E5 | MUST | Get my browser back | E.9 | — |

## Not ready list, done in round 2

Round 2 designed all 34 screens and states and all 10 components from the first Not ready list, and closed 5 of its 7 handoff items. Frames names where each item now lives. Needed for keeps the first handoff’s staging, so the build plan can follow it: Demo Day, Pilot, After pilot. Change any label in its dropdown.

### Screens and states (34)

| Item | Frames | Surface | Story | Needed for | Status |
| --- | --- | --- | --- | --- | --- |
| Student ID field on Join | 1.1, edited | App | S1 | Demo Day | Done |
| Wrong exam code error | 1.1a | App | S1 | Demo Day | Done |
| Network and Üki version rows in the system check | 1.2, edited; D.5 | App | S2 | Demo Day | Done |
| Identity failed after 3 tries: student screen and proctor help | 1.3a, 1.5b | App, Proctor | S3 | Demo Day | Done |
| Roster rows with errors and the Fix email step | 0.3a, 0.3b | Office | A2 | Demo Day | Done |
| Invite email with the exam code and install link | 0.8 | Email | A2 | Demo Day | Done |
| Proctor confirms seats and languages | 0.9, 0.9a | Proctor | A3 | Demo Day | Done |
| Read-only report page behind the 7-day share link | 3.5 | Public page | A5 | Demo Day | Done |
| Handling a delete or copy request | A.5a, A.5b | Office | A10 | Demo Day | Done |
| Student screens in Kazakh and Russian | 16 frames in Languages; S.1, S.2 | App | S6 | Demo Day | Done |
| Ask proctor: the student’s request and the proctor’s inbox | E.5a, 1.3a, 2.4d; button on 2.1–2.3 | Lock, App, Proctor | E4 | Demo Day | Done |
| Built-in calculator | E.5b | Lock | E4 | Demo Day | Done |
| New exam step 1 · Details | 0.4, with the review step 0.5 | Office | — | Demo Day | Done |
| Staff sign-in, password reset and invite acceptance | A.0, A.0a, A.0b | Office, Proctor | — | Pilot | Done |
| Desktop app download, install and OS camera permission | 1.0, 1.0a | App | — | Pilot | Done |
| Update required | 1.0b | App | — | Pilot | Done |
| Offline and reconnect | 2.1a | App | — | Pilot | Done |
| Time up and auto-submit | 2.1b; in the LMS, Üki Lock releases as on E.9 | App, Lock | — | Pilot | Done |
| Paused or ended by the proctor | 2.1c, 2.1d, E.5f, 2.4e | App, Lock | P2 | Pilot | Done |
| Windows window frame | 2.1w; OS: Windows on App/Title bar and Browser/Top bar | App, Lock | — | Pilot | Done |
| Exam detail: edit, cancel or duplicate a scheduled exam | 0.6, 0.6a | Office | — | Pilot | Done |
| Questions for exams that run in the Üki app | 0.7 | Office | — | Pilot | Done |
| Proctor home: my exams and seat assignments | 0.9 | Proctor | — | Pilot | Done |
| Lock error states: pairing failed, app disconnected, full-screen exit | E.3a, E.5c, E.5d | Lock | E2, E4 | Pilot | Done |
| Store listing images for Chrome Web Store and Edge Add-ons | E.10, E.10a | Lock | — | Pilot | Done |
| Report PDF and the privacy processing record | 3.4b, A.1a, A.5c | Office | A5, A7 | Pilot | Done |
| Empty, loading and error states for lists and tables | 0.1d, 0.1e, 3.2c, A.2a; Table/Empty state, Table/Skeleton row, Banner | Office, Proctor | — | Pilot | Done |
| Landing on mobile, the pilot request form, privacy policy and terms | Mobile 390, Book a pilot and its sent state, Privacy policy, Terms of use | Landing | — | Pilot | Done |
| Student sees a proctor message and a new end time | 2.1e, E.5e | App, Lock | P3 | After pilot | Done |
| Invite a proctor and set team roles | A.4a, A.4b | Office | A9 | After pilot | Done |
| SSO, webhook and roster-schedule setup | A.4c, A.4d | Office | A9 | After pilot | Done |
| Notifications page and full search results | A.7, A.8 | Office | A4, A8 | After pilot | Done |
| Dark theme beyond the live wall and drawer | D.1–D.6 | All surfaces | — | After pilot | Done |
| Dashboard at tablet widths | T.1, T.2 | Office, Proctor | — | After pilot | Done |

### Components (10)

| Item | Component | Used by | Needed for | Status |
| --- | --- | --- | --- | --- |
| Dialog | Dialog, Tone: Default, Danger | Pause or end a session, Fix email, delete request, invite a proctor | Demo Day | Done |
| Input states: error, focus, disabled | Input, State: Default, Focus, Error, Disabled | Join code and every form | Demo Day | Done |
| Button states: hover, pressed, focus, loading | Button, State: Default, Hover, Pressed, Focus, Loading | Every screen | Demo Day | Done |
| Multi-line text field | Text area | Review note (3.3), messages | Demo Day | Done |
| Date and time picker | Popover/Date picker | New exam step 1 (0.4) | Demo Day | Done |
| File upload with row errors | File upload, State: Empty, Uploading, Valid, Errors | Roster CSV (0.3, 0.3a) | Demo Day | Done |
| Toast for the dashboard and the app | Toast, Kind: Success, Info, Error, Progress | Saved, sent, failed | Pilot | Done |
| Table header with sorting and pagination; empty and loading rows | Table/Header cell, Table/Pagination, Table/Empty state, Table/Skeleton row | Exams, sessions, students, audit log | Pilot | Done |
| Focus ring and keyboard order | Focus/Ring effect, border/focus and border/focus-ring tokens, Focus order marker | Keyboard and screen-reader users | Pilot | Done |
| Chart parts: line, bar, donut, tooltip | Chart/Line, Chart/Bars, Chart/Donut, Chart/Legend item, Chart/Tooltip; A.1a uses them, A.1 still draws its charts as frames | Reports | After pilot | Done |

### Handoff

- [ ] Code Connect: none of the 78 components is mapped to code yet; it needs the codebase.
- [x] Variables and text styles: 816 of 15,468 solid fills on the Prototype page skip variables, all of them mascot art (681) or macOS and Windows window buttons (135). 14 of 5,879 strokes skip them: 11 section outlines on the canvas and the HUD’s 10% white hairline. 206 of 7,828 text layers skip text styles, all inside scaled copies (avatar initials, camera tiles, the store-listing miniature), where a fixed style would break the scale.
- [x] Space tokens: the 20 px grid gap and the 120 and 160 px section padding are now space/20, space/120 and space/160.
- [x] Events: 08 Handoff names all 25 events in its Event names card (see Events to faces).
- [x] String catalog: S.1 and S.2 hold 135 student strings in English, Kazakh and Russian, with keys and notes.
- [x] Window sizes: 08 Handoff sets the minimum window and breakpoints for every surface in its Windows and breakpoints card; T.1 and T.2 show the dashboard at 1024 px.
- [ ] Brand kit: the README and prompt list still miss the second image batch; this session could not write to the kit folder.

## Engineering inputs

The screens imply 26 data objects, 8 state flows and on-laptop detection of gaze, phones, faces and identity. The design promises that video and audio never leave the laptop and that proctoring sends only events and flagged frames. Answers, check-in status, device and consent records must reach the server too: 2.1a shows answers waiting on the laptop and syncing when the network returns, and A.4d sends flags, ended sessions and reports to the LMS by webhook.

### Data objects (26)

| Object | Fields shown in the design | Screens |
| --- | --- | --- |
| Workspace and faculty | University, faculties, faculty switcher | 0.1c |
| Staff user | Name, role (exam office or proctor), group, languages, sign-in, invite status | 0.3, A.4b, A.0, A.0b |
| Exam | Name, course, type, date, start, duration, groups, room, proctors, where it runs (Üki app or LMS), checks, thresholds, rules language, status, readiness | 0.1, 0.2, 0.4, 0.5, 0.6, E.1 |
| Question (new) | Text, type, topic, choices, draft status, exams that use it | 0.7 |
| Browser rules | Exam link, allowed sites, built-in calculator, six lock rules | E.1 |
| Student | Name, student ID, group, programme and year, email, language, flags, review status | A.2, A.3, A.8 |
| Roster import | CSV file, row checks with the error per row, weekly import from the dean’s office | 0.3, 0.3a, A.4d |
| Proctor assignment | Proctor, seat range, languages, confirmed | 0.3, 0.9, 0.9a |
| Invite | Exam code, student ID, install link, email status: sent, opened, bounced | 0.3, 0.3b, 0.8, 1.5 |
| Device and pairing | OS, Üki version, browser, 6-digit pairing code, last seen | 1.5, A.3, E.3, E.3a, 1.0b |
| Session | Student and exam, check-in step, identity result, time used, extra time, end reason, receipt ID | 1.5, 2.4, 2.4e, 2.1d, 3.1 |
| Answer | Question, choice, time saved on the laptop, sync state | 2.1, 2.1a |
| Event | Time, type, detail, confidence; the 25 names under Events to faces | 2.1, 2.5, E.8 |
| Flag and frame | Session, type, time, confidence, still frames, deletion date | 3.3, 3.4 |
| Review decision | No issue, talk to the student, or committee; note; reviewer; time | 3.3, 3.2c |
| Integrity report | ID, flags, decision, PDF and CSV export, share link with a 7-day expiry, verify code | 3.4, 3.4b, 3.5 |
| Term report (new) | Term, faculty, exams run, sessions, flags per 100, decisions, review time, verify code | A.1, A.1a |
| Message and extra time | One student or the group, preset text, translation, minutes, new end time | 2.4b, 2.4c, 2.1e, E.5e |
| Help request (new) | Student, exam, what they ask, time, done | 1.3a, E.5a, 2.4d |
| Consent | Rules accepted (language, time), camera allowed | 1.4, A.3, 1.0a |
| Data request | Type (delete or copy), student, due date, items, reply | A.5, A.5a, A.5b |
| Audit entry | Time, who, action, object | A.6 |
| Notification (new) | Kind (flag, request, system), text, time, read | 0.1a, A.7 |
| Settings | Exam defaults, default checks, integrations (Üki Lock, SSO, roster import, webhooks), team | A.4 |
| SSO connection (new) | Provider (Microsoft Entra ID, Google Workspace or SAML 2.0), tenant ID, attribute mapping, test result | A.4c |
| Webhook (new) | Endpoint URL, events, signing secret, deliveries with status and retries | A.4d |

### State flows (8)

| Object | States | Screens |
| --- | --- | --- |
| Exam | Draft → Scheduled → Live → Flags to review → Reviewed; Scheduled → Cancelled | 0.1, 0.5, 0.6, 0.6a |
| Invite | Sent → Opened; Bounced → Fix email → Sent | 0.3, 0.3b, 0.8 |
| Check-in | Not joined → Joined → System check → Identity (up to 3 tries) → Rules → Ready; Update required before Joined; Need help from any step, with proctor help on identity | 1.0b, 1.5, 1.3a, 1.5b |
| Writing | Watching ⇄ Looked away ⇄ Phone ⇄ Paused (no face, camera lost or by the proctor) ⇄ Offline → Submitted, Time up or Ended by the proctor | 2.1–2.3, 2.1a–2.1d, 2.4, Widget/Live |
| Review | Needs review → No issue, Talk to the student, or Committee; Queue clear when none is left | 3.2, 3.3, 3.2c |
| Üki Lock | Off → Not paired → Ready → Locked → Released; Pairing failed → Not paired; Locked ⇄ App disconnected, Full-screen exit, Paused by the proctor | E.3–E.9, E.3a, E.5c, E.5d, E.5f, Ext/Toolbar icon |
| Staff account (new) | Invited → Accepted → Active; password reset from sign-in | A.4a, A.0b, A.0, A.0a |
| Data request (new) | Received → Due → Done: deleted, copy sent, or replied with a reason | A.5, A.5a, A.5b |

### Event names

All 25 events now have names (08 Handoff, Event names; the full list is under Events to faces). Round 2 named the 10 that the screens showed without one: exam.started, browser.locked, identity.matched, answer.saved, session.paused, face.second, gaze.down, camera.lost, copy.blocked and site.closed. It added 8 for the new states: exam.time\_up, proctor.paused, proctor.ended, proctor.time\_added, proctor.message, student.help\_requested, lock.app\_disconnected and lock.fullscreen\_exit.

### On the laptop

The screens assume 8 capabilities on the student’s laptop; Open questions flags the ones to test first.

| Capability | What the screens show | Screens |
| --- | --- | --- |
| Gaze | Off screen past the threshold, with direction (left, down) and duration | 0.2, 2.4, 3.3 |
| Phone | Phone in frame with a confidence; flag at ≥ 0.85 | 0.2, 2.2 |
| Faces | One face, no face, second face | 1.3, 2.3, 2.4 |
| Identity | Read the student card; match the face to the photo on the student card, on the laptop; proctor sees only “matched” or “needs help” | 1.3 |
| System check | Camera free and uncovered, other apps (Telegram), screen sharing or remote desktop, free storage, network to the exam server, Üki version | 1.2, 1.0a, 1.0b, D.5 |
| Local storage | Answers and evidence kept on the laptop; answers sync when the network returns | 1.2, 2.1, 2.1a |
| Browser lock | Close and restore tabs, allow-list sites, block copy, print, developer tools, other extensions and screen sharing, require full screen | E.1–E.9, E.3a, E.5a–E.5f |
| Audio | Never recorded | 0.2, A.5 |

### Retention and hosting (A.5, A.6)

Video and face data never leave the laptop; frames and events stay 90 days on a server in Kazakhstan. That is the promise A.5 draws; the hackathon build keeps them in a Supabase project in Frankfurt with no cleanup job, and A.5 changes to match in Phase 1.

| Data | Where | Kept | Who sees |
| --- | --- | --- | --- |
| Webcam video | Student laptop only | Not stored | No one |
| Face match | Student laptop | Deleted after the check | No one |
| Flagged frames | Üki server · Kazakhstan | 90 days | Proctor, exam office |
| Event log | Üki server · Kazakhstan | 90 days | Proctor, exam office |
| Audio | — | Not recorded | — |
| Integrity reports | Exam office | 1 year | Committee, on request |
| Audit log | — | 1 year; users can’t edit or delete entries | Exam office |

A nightly cleanup deletes expired frames (“Next cleanup tonight, 03:00” on A.5).

### Copy and languages (07 Voice)

Kazakh first, Russian and English always; every string must fit the same space in all three. Üki reports what it saw and never accuses: plain words, numbers instead of alarms, no verdicts.

| Use | Not |
| --- | --- |
| looked away | gaze violation |
| phone | unauthorized device |
| flag | incident |
| check in | identity authentication |
| report | evidence package |
| paused | session suspended |

| ҚАЗ | РУС | ENG |
| --- | --- | --- |
| Емтихан басталды | Экзамен начался | Exam started |
| Телефон табылды | Телефон обнаружен | Phone found |
| Үзіліс | Пауза | Paused |
| Тапсырылды | Сдано | Submitted |
| Бәрі дұрыс | Всё в порядке | All clear |

The string catalog ([S.1](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=171-15780), [S.2](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=172-15868)) holds all 135 student strings with keys, the English source, Kazakh and Russian. Across all keys Kazakh and Russian run 4% longer than English, but single strings grow up to 70%; the notes mark every key that grows 30% or more. Six strings change with a count and need ICU plural rules. The Kazakh and Russian copy is a first pass for a native editor.

## Open questions

Sixteen decisions the design leaves to engineering and to the team. Round 2 settled one, the Phase 0 build plan settles nine more (ticked), and six stay open.

- [ ] Exam content: 0.7 designs a question bank in Üki, with authoring and import from QTI or Moodle XML. Confirm both import formats, and whether LMS exams keep their questions in the LMS only.
- [x] Answers: saved on the laptop and synced to the Üki server on every save; sending them to the LMS waits for a later phase.
- [x] Join: 1.1 now asks for the exam code and the student ID, as S1 asks.
- [x] Enrolment photo: none. The build plan matches the live face to the photo on the student card, on the laptop.
- [x] Hosting: Supabase Cloud in Frankfurt (eu-central-1) for the hackathon build; A.5’s “Üki server · Kazakhstan” rows change to match in Phase 1.
- [x] Desktop app: Electron 44 on macOS and Windows.
- [x] Detection: MediaPipe Face Landmarker and Object Detector, Human for the card photo match and Tesseract.js for the card digits; the weakest laptop is an 8th-gen Core i5.
- [x] Üki Lock: one tab, allowed sites, copy and print blocking and full screen are enforced; screen sharing is detected by the app; developer tools need administrator policy, and pausing other extensions waits for Phase 2.
- [x] Browsers: Chrome, Edge, Yandex Browser and Opera; Firefox and Safari are out of scope.
- [ ] LMS: exam.kru.test is a placeholder. Which LMS does KRU run, and what should webhooks send to it?
- [ ] Camera and Call: the tile menu offers “camera” (2.4a) and the lobby offers “Call” (1.5). What do they do if video never leaves the laptop?
- [x] Token files: generated from the Figma variables by `pnpm tokens` as CSS variables and a Tailwind theme.
- [ ] Demo data: every name, ID and number is fictional, and exam.kru.test and get.uki.test are placeholders. Which domains go live?
- [ ] Translations: the Kazakh and Russian strings in S.1 and S.2 are a first pass. Who edits them before the pilot, and who signs off?
- [x] Legal: out of scope for the hackathon; the privacy policy, terms and processing record stay drafts.
- [ ] SSO: A.4c offers Microsoft Entra ID, Google Workspace and SAML 2.0. Which one does KRU use, and is SSO in the pilot?

## Sources

Every count comes from a scan of the Figma file on 7 Oct 2026.

- [Figma file](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh)
- [Prototype page](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=38-2040)
- [User stories board](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=112-2039)
- [Design Book · 08 Handoff](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=21-1939)
- [Design Book · 07 Voice](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=20-1935)
- [App parts](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=38-2042) and [Book parts](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=8-2)
- [Backgrounds](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=29-2005)
- [Landing](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=114-2039)
- [Additions · Demo Day](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=151-11477)
- [Languages · ҚАЗ and РУС](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=167-14436)
- [Additions · Pilot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=177-15940)
- [Additions · After pilot](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=199-18877)
- [08 Handoff · Event names](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=212-2039)
- [08 Handoff · Windows and breakpoints](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=212-2521)
- [Landing · Mobile 390](https://www.figma.com/design/9RB9aBz6lzS6XHpf5do5Gh?node-id=192-3586)
