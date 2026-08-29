-- 0004_auth_triggers.sql
-- Provision profile + stats rows when an auth user is created.
--
-- On the OnSpace backend this trigger was missing/undocumented, which is why
-- the auth service logs "Database trigger missing ... user profile creation
-- failed" (template/auth/supabase/service.ts). Creating it explicitly here.

-- Derive a unique username from email local-part, de-duplicating on collision.
-- user_profiles.username is UNIQUE (citext), and email local-parts collide
-- often (alice@a.com / alice@b.com), so a naive insert would fail signup.
create or replace function public.generate_unique_username(p_seed text, p_user_id uuid)
returns citext
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_base      text;
  v_candidate text;
begin
  v_base := regexp_replace(coalesce(nullif(trim(p_seed), ''), 'player'), '[^A-Za-z0-9_]', '', 'g');
  if char_length(v_base) < 2 then
    v_base := 'player';
  end if;
  v_base := left(v_base, 20);

  -- Serialize equal seeds. Without this lock, two simultaneous signups could
  -- both observe the base as available and one auth transaction would fail on
  -- the unique index.
  perform pg_advisory_xact_lock(hashtextextended(lower(v_base), 0));

  v_candidate := v_base;
  if exists (select 1 from public.user_profiles where username = v_candidate::citext) then
    -- UUID-derived suffix is stable, non-enumerating and effectively unique;
    -- 13 base chars + '_' + 10 hex chars stays inside the 24-char limit.
    v_candidate := left(v_base, 13) || '_' || left(replace(p_user_id::text, '-', ''), 10);
  end if;

  return v_candidate::citext;
end;
$$;

-- Normalize the authoritative username into Auth metadata before the user row
-- is stored. The AFTER trigger below then creates the public profile from that
-- exact value, so a fresh signup cannot start with divergent names.
create or replace function public.normalize_new_user_metadata()
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
    ),
    new.id
  );

  new.raw_user_meta_data := jsonb_set(
    coalesce(new.raw_user_meta_data, '{}'::jsonb),
    '{username}',
    to_jsonb(v_username::text),
    true
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_normalize on auth.users;
create trigger on_auth_user_metadata_normalize
  before insert on auth.users
  for each row execute function public.normalize_new_user_metadata();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username citext;
begin
  v_username := (new.raw_user_meta_data ->> 'username')::citext;

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

-- Keep user_profiles.username in step if Auth metadata is changed. This is a
-- BEFORE trigger so it can normalize the metadata itself and reject invalid or
-- duplicate changes atomically instead of silently allowing drift.
create or replace function public.sync_username_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_username text := trim(new.raw_user_meta_data ->> 'username');
begin
  if v_new_username is null then
    if old.raw_user_meta_data ->> 'username' is not null then
      raise exception 'Username metadata cannot be removed' using errcode = '22023';
    end if;
    return new;
  end if;

  if old.raw_user_meta_data ->> 'username' is distinct from v_new_username then
    if char_length(v_new_username) not between 2 and 24 then
      raise exception 'Username must be between 2 and 24 characters' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.user_profiles p2
       where p2.username = v_new_username::citext and p2.id <> new.id
    ) then
      raise exception 'That username is already taken' using errcode = '23505';
    end if;

    new.raw_user_meta_data := jsonb_set(
      coalesce(new.raw_user_meta_data, '{}'::jsonb),
      '{username}',
      to_jsonb(v_new_username),
      true
    );

    update public.user_profiles
       set username = v_new_username::citext
     where id = new.id
       and username <> v_new_username::citext;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;
create trigger on_auth_user_metadata_updated
  before update of raw_user_meta_data on auth.users
  for each row execute function public.sync_username_from_auth();

-- Username change with a real uniqueness error the UI can show.
create or replace function public.update_my_username(p_username text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'update_my_username requires an authenticated user' using errcode = '42501';
  end if;

  if p_username is null or char_length(trim(p_username)) not between 2 and 24 then
    raise exception 'Username must be between 2 and 24 characters' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.user_profiles
     where username = trim(p_username)::citext and id <> v_uid
  ) then
    raise exception 'That username is already taken' using errcode = '23505';
  end if;

  update auth.users
     set raw_user_meta_data = jsonb_set(
       coalesce(raw_user_meta_data, '{}'::jsonb),
       '{username}',
       to_jsonb(trim(p_username)),
       true
     )
   where id = v_uid;

  if not found then
    raise exception 'Authenticated user is missing' using errcode = '23503';
  end if;
end;
$$;
