-- Stage 4 fix: Storage deletes a file only if the user can also select it.
-- The public bucket serves files by URL without this policy; it is needed for remove() alone.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create policy "users see own attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
