-- Stage 5: admin tools. Hide comments, and lock a paragraph's discussion with a reason.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- Admins hide and unhide comments. Only the hidden column can change.
create policy "admins hide comments" on public.comments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant update (hidden) on public.comments to authenticated;

-- A locked paragraph takes no new comments; likes still work.
-- id is the paragraph's first segment id; seg_ids lists all its segments, so the database can match comments to it.
create table public.locks (
  id         text primary key check (char_length(id) between 1 and 60),
  issue_id   text not null check (char_length(issue_id) between 1 and 60),
  seg_ids    text[] not null check (cardinality(seg_ids) between 1 and 200),
  reason     text not null check (char_length(btrim(reason)) between 2 and 300),
  locked_by  uuid not null default auth.uid() references auth.users(id),
  locked_at  timestamptz not null default now()
);

alter table public.locks enable row level security;

create policy "locks are public" on public.locks
  for select to anon, authenticated using (true);
create policy "admins lock" on public.locks
  for insert to authenticated with check (public.is_admin() and locked_by = auth.uid());
create policy "admins unlock" on public.locks
  for delete to authenticated using (public.is_admin());

grant select on public.locks to anon, authenticated;
grant insert (id, issue_id, seg_ids, reason) on public.locks to authenticated;
grant delete on public.locks to authenticated;

-- New comments are refused on a locked paragraph. Security definer so the check is not limited by the caller's view of locks.
create function public.is_locked(segs text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.locks where seg_ids && segs);
$$;

drop policy "users add own comments" on public.comments;
create policy "users add own comments" on public.comments
  for insert to authenticated
  with check (user_id = auth.uid()
    and (file_path is null or file_path like auth.uid()::text || '/%')
    and not public.is_locked(seg_ids)
    and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.pen_name is not null));

alter publication supabase_realtime add table public.locks;

-- Make Aviv an admin (he has signed in already).
update public.profiles set is_admin = true
  where user_id = (select id from auth.users where email = 'aviv.bry@gmail.com');
