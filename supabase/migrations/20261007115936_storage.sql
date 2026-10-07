-- The private `frames` bucket for flagged stills: JPEG only, 200 KiB at most (STILL.maxBytes in
-- packages/contracts/src/api.ts). Also declared in supabase/config.toml [storage.buckets.frames].
-- No storage.objects policies on purpose: the app uploads through signed upload URLs that `ingest`
-- makes with the secret key, and staff open stills only through the `stills` function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frames', 'frames', false, 204800, array['image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
