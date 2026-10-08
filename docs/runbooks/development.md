# Runbook: development against the cloud, the local stack on request

`pnpm dev` runs the four apps against the cloud demo project and starts nothing else: no Docker, no local Supabase, no `functions serve`. The local Supabase stack is opt-in, with `pnpm dev:local`. The database tests run in CI. The runner is `scripts/dev.ts`; what reaches the apps is decided in `scripts/lib/dev-env.ts`, and the stack check in `scripts/lib/local-stack.ts`.

## 1. `pnpm dev`: the cloud demo project

1. Put the cloud project's public values into `.env.cloud` in the repository root. git ignores it (`.env.*`).

   ```sh
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Both come from the Supabase dashboard, Project Settings, API Keys, or from whoever runs the demo project. Nothing else is needed. If the file is missing, `pnpm dev` stops and prints these lines.
2. Run `pnpm dev`. It prints one line saying it uses the cloud demo backend, which is the shared, live demo data, then starts web on http://localhost:3000, the mock portal on http://localhost:5180, the desktop app and Üki Lock in watch mode. `pnpm dev --only web` (or any comma-separated subset of `web`, `lms-mock`, `desktop`, `lock`) starts fewer apps.

What the apps get:

| Value | From |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and their `NEXT_PUBLIC_` and `VITE_` copies | `.env.cloud` only, over the shell and `.env`. An explicit `NEXT_PUBLIC_SUPABASE_URL` (and so on) in `.env.cloud` wins over the copy |
| Other build values: `VITE_LOCK_EXTENSION_ID`, `LOCK_DEV_PUBLIC_KEY`, `VITE_EXAM_OFFICE_EMAIL`, `UKI_ALLOW_CAPTURE` | The shell, then `.env.cloud` (`NEXT_PUBLIC_*`, `VITE_*` and `LOCK_*` only), then `.env` |
| `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`, every `SEED_*` and any name containing SECRET, PASSWORD, PRIVATE, TOKEN, SERVICE_ROLE or API_KEY | Never. Their lines in `.env.cloud` are skipped before their value is read, and the names are removed from the environment the apps inherit, even when your shell exports them |

`pnpm dev` refuses to start, naming the variable and never its value, when `.env.cloud` lacks the address or the key, when the address is not an `https` cloud address (that is `pnpm dev:local`), or when a public line holds a secret key (`sb_secret_…`), for example one pasted into `SUPABASE_PUBLISHABLE_KEY` by mistake. It prints no value.

**Shared demo data.** The cloud project is the live demo environment: judges, the exam office and every developer see the same exams. Reading is harmless. Signing in, joining an exam (it takes a real seat), sending a command or changing a setting happens for everyone. Try joins and data changes on the local stack. Only the demo's owner resets the cloud data (`pnpm demo:reset --env-file .env.cloud`); `main` deploys migrations and Edge Functions there on every merge (`deploy-supabase.yml`), and Vercel deploys the dashboard.

## 2. `pnpm dev:local`: the local stack

Needs Docker and the Supabase CLI (2.107 or later).

```sh
pnpm db:start        # the slim stack on 547xx; the first start applies the migrations and supabase/seed.sql
pnpm env:local       # .env with the local URL and keys and a generated SEED_STAFF_PASSWORD
pnpm seed:staff
pnpm demo:reset
pnpm dev:local       # functions:sync, supabase functions serve with supabase/functions/local.env, the four apps
```

`pnpm dev:local` starts the stack itself when nothing answers on its ports, so `pnpm db:start` is only needed for the database alone. The apps get the shell's values, then `.env`'s `NEXT_PUBLIC_*`, `VITE_*`, `UKI_*` and `LOCK_*` lines; no secret name reaches them here either.

The slim stack (`supabase start -x studio,postgres-meta,imgproxy,mailpit,logflare,vector,supavisor,edge-runtime`) runs the database, auth, PostgREST, Realtime, Storage and the Kong gateway, which is all Üki uses. Left out:

| Container | Why Üki does not need it |
| --- | --- |
| `studio`, `postgres-meta` | The Supabase dashboard and its schema service. `pnpm db:types` runs its own one-off postgres-meta container |
| `imgproxy` | Image transformations; stills are served as they are |
| `mailpit` | Auth email. Staff sign in with a password, email confirmation is off, and invites go through the Resend stub (`supabase/functions/local.env`) |
| `logflare`, `vector` | Log collection |
| `supavisor` | The connection pooler, off in `config.toml` |
| `edge-runtime` | `supabase functions serve` runs the functions instead (2026-10-07 in `docs/decisions.md`) |

Stop the stack with `supabase stop` when you are done.

## 3. The database tests run in CI

These need the local stack: `pnpm db:reset`, `pnpm db:types`, `pnpm db:test` (pgTAP), `pnpm functions:serve`, `pnpm test:integration`, `pnpm test:integration:desktop`, `pnpm e2e`, `pnpm e2e:load`, and the desktop app's `e2e`, `e2e:realtime` and `e2e:cleanup`. Each runs `node scripts/lib/local-stack.ts <name>` first, which tries a TCP connection to the API and database ports in `supabase/config.toml` (54721 and 54722) and, when nothing answers, stops within a second:

```text
[db:reset] the local Supabase stack is not running (nothing answers on 127.0.0.1:54721 (API) or 127.0.0.1:54722 (database)): needs pnpm dev:local, or runs in CI
```

The check needs neither Docker nor the Supabase CLI. With `SUPABASE_WORKDIR` set (a second stack with its own `config.toml`, as the CLI reads it) it checks that stack's ports. It also keeps these scripts off the cloud: `test/integration/stack.ts` falls back to `.env`'s address when the CLI finds no stack, and a `.env` pointing at the cloud would otherwise have run the tests there.

CI's stack job (`.github/workflows/ci.yml`) starts the same slim stack with `pnpm db:start` and runs every one of them except the desktop app's end-to-end tests, on every push and pull request:

```sh
gh pr checks <number> --watch        # wait for the run
gh run view <run id> --log-failed    # the failing step's log
```

A failed "Vercel" status is the preview deploy, not CI. Without a database, run `pnpm check` (Biome, guards, type checks, unit tests), `pnpm test:functions` (the Edge Functions' unit tests alone) and the builds; Playwright works against pages whose data is mocked.

## 4. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `pnpm dev` prints that `.env.cloud` is missing | Create it as in step 1 |
| `.env.cloud is not usable: SUPABASE_URL … must be the cloud project's address` | The file points at a local stack: use `pnpm dev:local`, or put the `https://<project-ref>.supabase.co` address there |
| `… holds a secret key (sb_secret_…)` | A secret key sits in a public line; put the publishable key (`sb_publishable_…`) there |
| The desktop app does not start: port 5173 is in use | Another Vite dev server holds 5173 (`lsof -nP -iTCP:5173 -sTCP:LISTEN`). Stop it, or run `pnpm dev --only web,lms-mock,lock` |
| A database script stops with "needs pnpm dev:local, or runs in CI" | Start the stack (`pnpm dev:local` or `pnpm db:start`), or push and read CI |
| The dashboard signs in on the cloud but a Phase 1 screen errors | The cloud gets migrations only when they reach `main`; a branch's new migration exists only on the local stack and in CI |
