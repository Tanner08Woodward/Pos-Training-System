-- supabase/schema.sql: database setup for the Training Lab
--
-- HOW TO RUN (one time):
--   1. Supabase dashboard -> SQL Editor -> New query
--   2. Change the manager passcode on the line marked >>> below
--   3. Paste this whole file and press Run
-- Safe to run again later: it only creates what's missing.
--
-- SECURITY IN PLAIN ENGLISH
-- * The website uses the public "anon" key, which anyone can see.
-- * So NO table can be read or changed directly with that key (row-level
--   security is on with no policies).
-- * The website can only call three functions:
--     save_attempt(...)        trainees save a result (write-only)
--     manager_attempts(code)   read results, only with the manager passcode
--     manager_clear(code)      delete results, only with the passcode
-- * Prototype-level protection. Real manager logins come later.

create extension if not exists pgcrypto with schema extensions;

-- Who bought it (one row for now) and their stores --------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  created_at timestamptz not null default now()
);

-- Manager passcode (stored scrambled, never as plain text) -------------------
create table if not exists app_settings (
  organization_id uuid primary key references organizations(id),
  manager_code_hash text not null
);

-- Every Challenge / Training attempt, with its full tap-by-tap log -----------
create table if not exists attempts (
  id text primary key,
  organization_id uuid references organizations(id),
  location_id uuid references locations(id),
  trainee_id text not null,
  trainee_name text not null check (char_length(trainee_name) between 1 and 40),
  mode text not null check (mode in ('challenge', 'lesson')),
  scenario_id text not null,
  scenario_version int,
  scoring_version int,
  score int,
  passed boolean,
  seconds numeric,
  started_at timestamptz,
  finished_at timestamptz,
  data jsonb not null,             -- the full attempt (feedback, mistakes, events...)
  created_at timestamptz not null default now()
);
create index if not exists attempts_trainee_idx on attempts (trainee_id);
create index if not exists attempts_created_idx on attempts (created_at);

alter table organizations enable row level security;
alter table locations enable row level security;
alter table app_settings enable row level security;
alter table attempts enable row level security;
revoke all on organizations, locations, app_settings, attempts from anon, authenticated;

-- First-time data: the organization, 4 stores, and the manager passcode -------
do $$
declare org uuid;
begin
  select id into org from organizations order by created_at limit 1;
  if org is null then
    insert into organizations (name) values ('Handel''s DFW') returning id into org;
    insert into locations (organization_id, name)
      values (org, 'Store 1'), (org, 'Store 2'), (org, 'Store 3'), (org, 'Store 4');
  end if;
  if not exists (select 1 from app_settings where organization_id = org) then
    insert into app_settings (organization_id, manager_code_hash)
    values (org, extensions.crypt(
      'change-this-code',   -- >>> CHANGE THIS to your manager passcode (8+ characters) <<<
      extensions.gen_salt('bf')));
  end if;
end $$;

-- Functions the website may call ---------------------------------------------
create or replace function save_attempt(p jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare org uuid;
begin
  if p is null or p->>'id' is null or p->'trainee'->>'id' is null then
    raise exception 'missing fields';
  end if;
  if octet_length(p::text) > 500000 then
    raise exception 'attempt too large';
  end if;
  select id into org from organizations order by created_at limit 1;
  insert into attempts (
    id, organization_id, trainee_id, trainee_name, mode, scenario_id,
    scenario_version, scoring_version, score, passed, seconds,
    started_at, finished_at, data)
  values (
    p->>'id', org, p->'trainee'->>'id', p->'trainee'->>'name',
    coalesce(p->>'mode', 'challenge'), p->>'scenarioId',
    (p->>'scenarioVersion')::int, (p->>'scoringVersion')::int,
    (p->>'score')::int, (p->>'passed')::boolean, (p->>'seconds')::numeric,
    (p->>'startedAt')::timestamptz, (p->>'finishedAt')::timestamptz, p)
  on conflict (id) do nothing;   -- re-sending the same attempt is harmless
  return p->>'id';
end $$;

create or replace function manager_code_ok(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from app_settings
    where manager_code_hash = extensions.crypt(p_code, manager_code_hash));
$$;

create or replace function manager_attempts(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not manager_code_ok(p_code) then
    raise exception 'wrong code';
  end if;
  return coalesce(
    (select jsonb_agg(data order by created_at) from attempts),
    '[]'::jsonb);
end $$;

create or replace function manager_clear(p_code text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare n int;
begin
  if not manager_code_ok(p_code) then
    raise exception 'wrong code';
  end if;
  delete from attempts;
  get diagnostics n = row_count;
  return n;
end $$;

-- Only these three functions are callable from the website.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function save_attempt(jsonb) to anon;
grant execute on function manager_attempts(text) to anon;
grant execute on function manager_clear(text) to anon;
