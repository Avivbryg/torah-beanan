-- Stage 4: attachments (an image or PDF on a comment, up to 20MB).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- A public bucket: anyone can open a file by its URL. Storage itself enforces the size and type limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', true, 20971520,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

-- Files live under <user_id>/...; each user uploads only into their own folder.
create policy "users upload own attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- Users delete their own files; admins delete any (when deleting someone's comment).
create policy "users delete own attachments" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- A comment may point only at a file in its author's folder, of an allowed type.
alter table public.comments add check (file_type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'));
alter table public.comments add check ((file_path is null) = (file_type is null));

drop policy "users add own comments" on public.comments;
create policy "users add own comments" on public.comments
  for insert to authenticated
  with check (user_id = auth.uid()
    and (file_path is null or file_path like auth.uid()::text || '/%')
    and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.pen_name is not null));
