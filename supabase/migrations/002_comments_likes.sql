-- Stage 3: community comments and likes.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- True when the signed-in user is an admin. Security definer so policies can call it without granting more on profiles.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false);
$$;

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  issue_id   text not null check (char_length(issue_id) between 1 and 60),
  seg_ids    text[] not null check (cardinality(seg_ids) between 1 and 50),
  whole      boolean not null default false,
  title      text check (char_length(title) <= 80),
  body       text check (char_length(body) <= 4000),
  link       text check (link ~ '^https?://' and char_length(link) <= 2000),
  file_path  text,  -- stage 4
  file_type  text,
  file_name  text check (char_length(file_name) <= 120),
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  check (coalesce(btrim(body), '') <> '' or link is not null or file_path is not null)
);
create index comments_issue_idx on public.comments (issue_id);

alter table public.comments enable row level security;

-- Everyone reads comments that are not hidden; admins also see hidden ones.
create policy "comments are public" on public.comments
  for select to anon, authenticated using (not hidden or public.is_admin());

-- Signed-in users add comments as themselves, once they have a pen name.
create policy "users add own comments" on public.comments
  for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.pen_name is not null));

-- Users delete their own comments; admins delete any.
create policy "users delete own comments" on public.comments
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

grant select on public.comments to anon, authenticated;
grant insert (issue_id, seg_ids, whole, title, body, link, file_path, file_type, file_name) on public.comments to authenticated;
grant delete on public.comments to authenticated;

-- target_id is a comment id (uuid as text) or a note id from an issue file, e.g. "ber:b3".
create table public.likes (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_id  text not null check (char_length(target_id) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);
create index likes_target_idx on public.likes (target_id);

alter table public.likes enable row level security;

create policy "likes are public" on public.likes
  for select to anon, authenticated using (true);
create policy "users add own likes" on public.likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "users remove own likes" on public.likes
  for delete to authenticated using (user_id = auth.uid());

grant select on public.likes to anon, authenticated;
grant insert (target_id) on public.likes to authenticated;
grant delete on public.likes to authenticated;

-- Deleting a comment removes its likes, so pen-name scores stay right.
create function public.delete_comment_likes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.likes where target_id = old.id::text;
  return old;
end;
$$;

create trigger on_comment_deleted
  after delete on public.comments
  for each row execute function public.delete_comment_likes();

-- Live updates: browsers subscribe to changes in these tables.
alter publication supabase_realtime add table public.comments, public.likes, public.profiles;
