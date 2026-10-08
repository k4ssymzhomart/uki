# Runbook: cloud setup

One Supabase project in Central EU (Frankfurt), `eu-central-1`, and two Vercel projects serve rehearsals and Demo Day (docs/phase-0-plan.md, Infrastructure and delivery). Do the steps in order; each ends with a check. Values in angle brackets are yours: `<ref>` is the project ref (the subdomain of `https://<ref>.supabase.co`).

The project uses the new API keys only: the publishable key (`sb_publishable_…`) goes into the apps, the secret key (`sb_secret_…`) only into your local `.env.cloud` for the scripts. Never the legacy `anon` or `service_role` keys.

## 1. Create the Supabase project

1. https://supabase.com/dashboard > New project. Name `uki`, region **Central EU (Frankfurt)**. Generate a database password and keep it in your password manager; it becomes the GitHub secret `SUPABASE_DB_PASSWORD`.
2. Authentication > Sign In / Providers: turn on **Allow anonymous sign-ins** (students join anonymously, then `join_exam` binds the session). Leave the Email provider on (staff sign in with email and password).
3. Project Settings > JWT Keys: the project must sign with an asymmetric key (ECC P-256 or RSA). `@supabase/server` in the Edge Functions refuses tokens signed with the legacy shared secret (docs/decisions.md, Edge Functions). If the current key is "Legacy JWT secret", migrate it and rotate to the new ECC key.
4. Project Settings > API Keys: copy the publishable key; create a secret key if there is none and copy it.
5. Optional hardening: Project Settings > Realtime, turn off public channel access (Üki uses private channels only).

Check: `curl -s https://<ref>.supabase.co/auth/v1/health -H "apikey: <publishable key>"` returns JSON with a version.

## 2. Link the repository and deploy the schema and functions

From the repository root on your laptop:

```sh
supabase login                                   # or export SUPABASE_ACCESS_TOKEN=<personal access token>
supabase link --project-ref <ref>                # asks for the database password
pnpm supabase:deploy                             # functions:sync, supabase db push, supabase functions deploy
```

`supabase db push` applies `supabase/migrations/`: the 17 tables with row-level security, the RPCs, the broadcast triggers, the private `frames` bucket (JPEG only, 200 KB) and `pg_cron` with the `session_tick` job every minute. `supabase functions deploy` deploys `ingest`, `frames`, `command` and `stills` with `verify_jwt = false` from `supabase/config.toml` (the functions verify every token themselves). Each bundle is about 16 MB of the 20 MB limit.

The functions accept browser calls only from allowed origins (`uki://app` and localhost are built in). After step 5, add the dashboard's Vercel origins:

```sh
supabase secrets set --project-ref <ref> UKI_ALLOWED_ORIGINS="https://<web>.vercel.app https://<web>-*.vercel.app"
```

Check: Database > Tables lists 17 tables, each with RLS enabled; Edge Functions lists the four functions; Integrations > Cron shows `session_tick`.

## 3. Load the seed once

`supabase/seed.sql` builds the KRU world relative to the time you load it. Load it **once**; a second run fails on duplicate keys (use `pnpm demo:reset` afterwards, never the seed again).

With psql (`brew install libpq`, then use `/opt/homebrew/opt/libpq/bin/psql`) and the connection string from the dashboard's **Connect** button (Session pooler, works over IPv4):

```sh
psql "<Session pooler connection string, with the database password filled in>" \
  -v ON_ERROR_STOP=1 \
  -c "set app.seed_lms_url = 'https://<lms>.vercel.app'" \
  -f supabase/seed.sql
```

Or paste the file into the dashboard's SQL editor and run it; Physics 1's portal link then points at localhost until step 4's `demo:reset` with `SEED_LMS_URL` set fixes it.

## 4. Staff accounts and demo data

Keep the cloud values in `.env.cloud` in the repository root. It is gitignored (`.env.*`) and gitleaks would flag a secret key anywhere else.

```sh
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
SEED_STAFF_PASSWORD=<a strong password, not the local one>
SEED_LMS_URL=https://<lms>.vercel.app
```

Then:

```sh
pnpm exec tsx --env-file=.env.cloud scripts/seed-staff.ts   # Dana, Aigerim, Nurlan, Gulnara; idempotent
pnpm demo:reset --env-file .env.cloud                       # asks before touching a cloud project; --yes skips the question
```

Check: `demo:reset` prints Mathematics 2 as scheduled 15 minutes ahead and Physics 1 as live, with `lms_url` on the Vercel portal.

## 5. Two Vercel projects

In https://vercel.com/new import the GitHub repository twice.

| Setting | Dashboard | Mock portal |
| --- | --- | --- |
| Project name | `uki-web` (for example) | `uki-lms` |
| Root Directory | `apps/web` | `apps/lms-mock` |
| Framework | Next.js (from `apps/web/vercel.json`) | Vite (from `apps/lms-mock/vercel.json`) |
| Install Command | from `vercel.json`: `pnpm install --frozen-lockfile --filter web...` | from `vercel.json`: `pnpm install --frozen-lockfile --filter lms-mock...` |
| Build Command | from `vercel.json`: `pnpm --filter web build` | from `vercel.json`: `pnpm --filter lms-mock build` |
| Output Directory | Next.js default | `dist` (from `vercel.json`) |
| Node.js Version | 24.x | 24.x |
| Environment variables (Production and Preview) | `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…`, `NEXT_TELEMETRY_DISABLED=1` | none |

Leave the install and build commands in Settings > Build and Deployment on their defaults so `vercel.json` decides. The `--filter <app>...` install takes only that app and the workspace packages it uses, so Vercel never downloads Electron or the desktop toolchain. Keep "Include files outside the root directory in the Build Step" on (the default): the apps build from the workspace packages. Vercel deploys previews for branches and production for `main`.

Then put the two production URLs back into the other steps: `UKI_ALLOWED_ORIGINS` (step 2), `SEED_LMS_URL` (step 4, then run `pnpm demo:reset --env-file .env.cloud` again).

Check: the dashboard URL redirects to `/sign-in`; Dana signs in and the overview lists Mathematics 2 next, Physics 1 live, History to review and 0 MB of video.

## 6. Desktop build variables

The student app is built on the MacBook, and for Windows on GitHub's Windows runners ([demo-laptops.md](demo-laptops.md)), with these values in the MacBook's `.env` or as repository variables:

```sh
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_LOCK_EXTENSION_ID=<the extension id derived from LOCK_DEV_PUBLIC_KEY>
```

The app's content security policy allows network connections to that Supabase URL only.

## 7. GitHub secrets and variables

```sh
gh secret set SUPABASE_ACCESS_TOKEN              # paste a token from https://supabase.com/dashboard/account/tokens
gh secret set SUPABASE_DB_PASSWORD               # paste the database password
gh secret set SUPABASE_PROJECT_REF --body <ref>

gh variable set UKI_ALLOWED_ORIGINS --body "https://<web>.vercel.app https://<web>-*.vercel.app"
gh variable set VITE_SUPABASE_URL --body https://<ref>.supabase.co
gh variable set VITE_SUPABASE_PUBLISHABLE_KEY --body sb_publishable_...
gh variable set VITE_LOCK_EXTENSION_ID --body <extension id>
gh variable set LOCK_DEV_PUBLIC_KEY --body <base64 DER public key>
```

| Name | Kind | Used by |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | Secrets | `deploy-supabase.yml`: link, `db push`, `functions deploy` after CI passes on `main` |
| `UKI_ALLOWED_ORIGINS` | Variable | `deploy-supabase.yml` sets it as a function secret on every deploy |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOCK_EXTENSION_ID` | Variables | `desktop-dist.yml` (manual installers); CI's desktop build falls back to local values |
| `LOCK_DEV_PUBLIC_KEY` | Variable | CI's Üki Lock build, for the fixed extension id; the private key stays on your laptop |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Variables, optional | CI's web build; placeholders otherwise |
| `DEPLOY_FREEZE` | Variable | `true` stops `deploy-supabase.yml` (Demo Day freeze) |
| `GITLEAKS_LICENSE` | Secret, optional | Only if the repository moves to an organization account |

The secret key is never a GitHub secret: no workflow needs it.

Check: push to `main`; after CI turns green, the Deploy Supabase run links, pushes (no new migrations) and deploys the functions.

## 8. End-to-end check against the cloud

```sh
pnpm demo:simulate --env-file .env.cloud --sessions 20 --seconds 90 --start-after 30 --watch
pnpm demo:reset --env-file .env.cloud --yes
```

The simulator signs in as Aigerim to listen on the private channel and prints the time from each event to its broadcast; from Kostanay the 95th percentile should stay under 1 second (Risks: if it does not, the demo promises 2 seconds). It also starts Mathematics 2 as Dana after 30 seconds. Record the figure in `docs/phase-0-exit.md`.

## 9. Demo Day freeze

On Thursday 15 October:

```sh
git tag demo-2026-10-16 && git push origin demo-2026-10-16
gh variable set DEPLOY_FREEZE --body true
```

In both Vercel projects set Settings > Git > Ignored Build Step to "Don't build anything" (or a custom command `exit 0`) until Demo Day ends, then undo both.
