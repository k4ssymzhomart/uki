-- Judge mode (docs/runbooks/judge-mode.md): the read-only staff role `observer`. On its own in this file
-- because Postgres refuses to use an enum value in the transaction that added it; the next migration
-- (20261013130100_judge_mode.sql) builds on it. `if not exists` keeps a second run harmless.
alter type public.staff_role add value if not exists 'observer';
