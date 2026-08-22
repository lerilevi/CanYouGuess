-- 0004_auth_triggers.sql
-- Provision profile + stats rows when an auth user is created.
--
-- On the OnSpace backend this trigger was missing/undocumented, which is why
-- the auth service logs "Database trigger missing ... user profile creation
-- failed" (template/auth/supabase/service.ts). Creating it explicitly here.

-- Derive a unique username from email local-part, de-duplicating on collision.
-- user_profiles.username is UNIQUE (citext), and email local-parts collide
-- often (alice@a.com / alice@b.com), so a naive insert would fail signup.
create or replace function public.generate_unique_username(p_seed text)
returns citext
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_base      text;
  v_candidate text;
  v_suffix    integer := 0;
begin
  v_base := regexp_replace(coalesce(nullif(trim(p_seed), ''), 'player'), '[^A-Za-z0-9_]', '', 'g');
  if char_length(v_base) < 2 then
    v_base := 'player';
  end if;
  v_base := left(v_base, 20);

  v_candidate := v_base;
  while exists (select 1 from public.user_profiles where username = v_candidate::citext) loop
    v_suffix    := v_suffix + 1;
    v_candidate := left(v_base, 20 - char_length(v_suffix::text)) || v_suffix::text;
  end loop;

  return v_candidate::citext;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username citext;
begin
  v_username := public.generate_unique_username(
    coalesce(
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );

  insert into public.user_profiles (id, username)
  values (new.id, v_username)
  on conflict (id) do nothing;

  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep user_profiles.username in step when the client updates auth metadata,
-- so the two can no longer drift (the bug fixed client-side in profileService
-- is now enforced by the database).
create or replace function public.sync_username_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_username text := new.raw_user_meta_data ->> 'username';
begin
  if v_new_username is null then
    return new;
  end if;

  if old.raw_user_meta_data ->> 'username' is distinct from v_new_username then
    update public.user_profiles
       set username = v_new_username::citext
     where id = new.id
       and username <> v_new_username::citext
       -- Silently skip if the name is taken; the client-facing
       -- update_my_username() RPC reports the conflict properly.
       and not exists (
         select 1 from public.user_profiles p2
          where p2.username = v_new_username::citext and p2.id <> new.id
       );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;
create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_username_from_auth();

-- Username change with a real uniqueness error the UI can show.
create or replace function public.update_my_username(p_username text)
returns void
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'update_my_username requires an authenticated user' using errcode = '42501';
  end if;

  if char_length(trim(p_username)) not between 2 and 24 then
    raise exception 'Username must be between 2 and 24 characters' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.user_profiles
     where username = trim(p_username)::citext and id <> v_uid
  ) then
    raise exception 'That username is already taken' using errcode = '23505';
  end if;

  update public.user_profiles
     set username = trim(p_username)::citext
   where id = v_uid;
end;
$$;
