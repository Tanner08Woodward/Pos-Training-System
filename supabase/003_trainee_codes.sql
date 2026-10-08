-- supabase/003_trainee_codes.sql: trainee codes + stores
--
-- HOW TO RUN (one time, safe to run again):
--   Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.
--   Run 002_validate_attempts.sql first if you haven't.
--
-- WHAT IT ADDS
-- * A trainees table: each trainee belongs to one store and has a 4-digit
--   trainee code (like a register login). Only first name + last initial.
-- * Managers (with the manager passcode) can add trainees, see their codes,
--   turn a trainee off, and rename stores.
-- * Trainees sign in with their code. After 100 wrong codes in 10 minutes
--   (all stores together), sign-in pauses for a few minutes, so nobody can
--   try all 10,000 codes quickly.
-- * Every new result is tied to the trainee's store. The manager only sees
--   results for their own organization.
-- Existing results are kept. Results from before trainee codes stay under
-- the typed name, with no store.

-- Trainees ------------------------------------------------------------------
create table if not exists trainees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  location_id uuid not null references locations(id),
  display_name text not null check (char_length(display_name) between 1 and 40),
  code text not null unique check (code ~ '^[0-9]{4}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists trainees_location_idx on trainees (location_id);

-- Wrong sign-in codes, kept for a day, to slow down guessing.
create table if not exists sign_in_failures (
  at timestamptz not null default now()
);
create index if not exists sign_in_failures_at_idx on sign_in_failures (at);

alter table trainees enable row level security;
alter table sign_in_failures enable row level security;
revoke all on trainees, sign_in_failures from anon, authenticated;

-- Which organization a manager passcode belongs to (NULL = wrong code).
create or replace function manager_org(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select organization_id from app_settings
  where manager_code_hash = extensions.crypt(p_code, manager_code_hash)
  limit 1;
$$;

-- Trainee sign-in: returns who they are and their store, or NULL for a
-- wrong code (NULL instead of an error so the failure is still recorded).
create or replace function trainee_sign_in(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t record;
begin
  if (select count(*) from sign_in_failures where at > now() - interval '10 minutes') >= 100 then
    raise exception 'too many tries, wait a few minutes';
  end if;
  select tr.id, tr.display_name, l.id as location_id, l.name as location_name
    into t
    from trainees tr join locations l on l.id = tr.location_id
    where tr.code = p_code and tr.active
    limit 1;
  if not found then
    insert into sign_in_failures default values;
    delete from sign_in_failures where at < now() - interval '1 day';
    return null;
  end if;
  return jsonb_build_object('id', t.id, 'name', t.display_name,
    'storeId', t.location_id, 'storeName', t.location_name);
end $$;

-- Manager: stores ----------------------------------------------------------
create or replace function manager_stores(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare org uuid := manager_org(p_code);
begin
  if org is null then raise exception 'wrong code'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
    from locations where organization_id = org), '[]'::jsonb);
end $$;

create or replace function manager_rename_store(p_code text, p_store uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare org uuid := manager_org(p_code);
begin
  if org is null then raise exception 'wrong code'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'store name must be 1-40 characters'; end if;
  update locations set name = trim(p_name) where id = p_store and organization_id = org;
  if not found then raise exception 'store not found'; end if;
end $$;

-- Manager: trainees ----------------------------------------------------------
create or replace function manager_trainees(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare org uuid := manager_org(p_code);
begin
  if org is null then raise exception 'wrong code'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', tr.id, 'name', tr.display_name, 'code', tr.code, 'active', tr.active,
      'storeId', l.id, 'storeName', l.name, 'createdAt', tr.created_at)
      order by l.name, tr.display_name)
    from trainees tr join locations l on l.id = tr.location_id
    where tr.organization_id = org), '[]'::jsonb);
end $$;

create or replace function manager_add_trainee(p_code text, p_store uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  org uuid := manager_org(p_code);
  clean text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  new_code text;
  row trainees;
begin
  if org is null then raise exception 'wrong code'; end if;
  if char_length(clean) not between 1 and 40 then raise exception 'name must be 1-40 characters'; end if;
  if not exists (select 1 from locations where id = p_store and organization_id = org) then
    raise exception 'store not found';
  end if;
  for i in 1..200 loop
    new_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from trainees where code = new_code);
    new_code := null;
  end loop;
  if new_code is null then raise exception 'no free trainee codes left'; end if;
  insert into trainees (organization_id, location_id, display_name, code)
    values (org, p_store, clean, new_code) returning * into row;
  return jsonb_build_object('id', row.id, 'name', row.display_name, 'code', row.code,
    'active', row.active, 'storeId', row.location_id,
    'storeName', (select name from locations where id = row.location_id), 'createdAt', row.created_at);
end $$;

create or replace function manager_set_trainee_active(p_code text, p_trainee uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare org uuid := manager_org(p_code);
begin
  if org is null then raise exception 'wrong code'; end if;
  update trainees set active = p_active where id = p_trainee and organization_id = org;
  if not found then raise exception 'trainee not found'; end if;
end $$;

-- Saving results: tie each result to the trainee's store -------------------
create or replace function save_attempt(p jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  org uuid;
  loc uuid;
  tname text;
  problem text := attempt_problem(p);
begin
  if problem is not null then
    raise exception 'invalid attempt: %', problem using errcode = '22023';
  end if;
  -- A signed-in trainee: the database decides their name, store and
  -- organization. Older name-only results: first organization, no store.
  select organization_id, location_id, display_name into org, loc, tname
    from trainees where id::text = p->'trainee'->>'id';
  if not found then
    select id into org from organizations order by created_at limit 1;
    tname := p->'trainee'->>'name';
  end if;
  insert into attempts (
    id, organization_id, location_id, trainee_id, trainee_name, mode, scenario_id,
    scenario_version, scoring_version, score, passed, seconds,
    started_at, finished_at, data)
  values (
    p->>'id', org, loc, p->'trainee'->>'id', tname,
    coalesce(p->>'mode', 'challenge'), p->>'scenarioId',
    (p->>'scenarioVersion')::int, (p->>'scoringVersion')::int,
    (p->>'score')::numeric::int, (p->>'passed')::boolean, (p->>'seconds')::numeric,
    (p->>'startedAt')::timestamptz, (p->>'finishedAt')::timestamptz, p)
  on conflict (id) do nothing;   -- re-sending the same attempt is harmless
  return p->>'id';
end $$;

-- Manager results: only their organization, with each result's store ------
create or replace function manager_attempts(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare org uuid := manager_org(p_code);
begin
  if org is null then raise exception 'wrong code'; end if;
  return coalesce((
    -- Name, store and trainee id come from the database columns, not from
    -- what the browser sent.
    select jsonb_agg(a.data || jsonb_build_object(
        'trainee', jsonb_build_object('id', a.trainee_id, 'name', a.trainee_name),
        'storeId', a.location_id, 'storeName', l.name)
      order by a.created_at)
    from attempts a left join locations l on l.id = a.location_id
    where a.organization_id = org), '[]'::jsonb);
end $$;

create or replace function manager_clear(p_code text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  org uuid := manager_org(p_code);
  n int;
begin
  if org is null then raise exception 'wrong code'; end if;
  delete from attempts where organization_id = org;
  get diagnostics n = row_count;
  return n;
end $$;

-- Only these functions are callable from the website.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function save_attempt(jsonb) to anon;
grant execute on function manager_attempts(text) to anon;
grant execute on function manager_clear(text) to anon;
grant execute on function trainee_sign_in(text) to anon;
grant execute on function manager_stores(text) to anon;
grant execute on function manager_rename_store(text, uuid, text) to anon;
grant execute on function manager_trainees(text) to anon;
grant execute on function manager_add_trainee(text, uuid, text) to anon;
grant execute on function manager_set_trainee_active(text, uuid, boolean) to anon;
