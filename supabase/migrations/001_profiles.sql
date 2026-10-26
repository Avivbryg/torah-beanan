-- Stage 2: profiles (pen names).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- The project was created with "automatically expose new tables" off, so access is granted explicitly below.

create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  pen_name   text check (pen_name is null or (
               char_length(btrim(pen_name)) between 2 and 30
               and pen_name = btrim(pen_name)
               and pen_name not in ('באר הפוטנציאל', 'מקורות'))),
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Pen names are unique, ignoring case.
create unique index profiles_pen_name_key on public.profiles (lower(pen_name));

alter table public.profiles enable row level security;

-- Everyone, signed in or not, can read pen names.
create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);

-- Each user can update only their own row, and only the pen_name column (see grants).
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.profiles to anon, authenticated;
grant update (pen_name) on public.profiles to authenticated;

-- A profile row is created automatically on first sign-in.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Make Aviv an admin after his first sign-in:
-- update public.profiles set is_admin = true
--   where user_id = (select id from auth.users where email = 'aviv.bry@gmail.com');
