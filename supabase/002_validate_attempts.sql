-- supabase/002_validate_attempts.sql: reject broken or made-up results
--
-- WHO NEEDS THIS: a database set up with schema.sql before October 9, 2026.
-- (schema.sql already includes these checks for new setups.)
--
-- HOW TO RUN (one time, safe to run again):
--   Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- It changes how NEW results are checked. It doesn't touch saved results,
-- tables, or the manager passcode.
--
-- WHAT CHANGES FOR TRAINEES: nothing, for results the website really sends.
-- A record that fails a check gets an error; the device marks it "rejected",
-- keeps it, and the manager can resend it from the dashboard.

-- Checks the shape of a result sent by the website. Returns NULL when it
-- looks right, or a short reason. Results are still sent by browsers, so this
-- stops broken or obviously made-up records; it can't prove a pass is real
-- (that needs the score to be recalculated on the server, a later step).
create or replace function attempt_problem(p jsonb)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  k text;
  f text;
  hi numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'not an object'; end if;
  if octet_length(p::text) > 500000 then return 'attempt too large'; end if;
  if jsonb_typeof(p->'id') is distinct from 'string' or (p->>'id') !~ '^[A-Za-z0-9_-]{1,64}$' then return 'bad id'; end if;
  if jsonb_typeof(p->'trainee') is distinct from 'object'
     or jsonb_typeof(p->'trainee'->'id') is distinct from 'string'
     or char_length(p->'trainee'->>'id') not between 1 and 80
     or jsonb_typeof(p->'trainee'->'name') is distinct from 'string'
     or char_length(p->'trainee'->>'name') not between 1 and 40 then return 'bad trainee'; end if;
  if p ? 'mode' and (p->>'mode') is distinct from 'challenge' and (p->>'mode') is distinct from 'lesson' then return 'bad mode'; end if;
  if jsonb_typeof(p->'scenarioId') is distinct from 'string' or (p->>'scenarioId') !~ '^[a-z0-9-]{1,64}$' then return 'bad scenarioId'; end if;

  -- Numbers must be real numbers in a sensible range (or left out).
  foreach k in array array['score', 'seconds', 'stars', 'hintsNeeded', 'tipsNeeded', 'wrongTaps', 'restarts', 'scenarioVersion', 'scoringVersion'] loop
    if p ? k and jsonb_typeof(p->k) <> 'null' then
      if jsonb_typeof(p->k) <> 'number' then return 'bad ' || k; end if;
      hi := case k when 'score' then 100 when 'stars' then 3 when 'seconds' then 86400 else 100000 end;
      if (p->>k)::numeric < 0 or (p->>k)::numeric > hi then return 'bad ' || k; end if;
    end if;
  end loop;
  if p ? 'passed' and jsonb_typeof(p->'passed') not in ('boolean', 'null') then return 'bad passed'; end if;
  -- A challenge pass needs 80+ (engine/scoring.js); anything else is made up.
  if coalesce(p->>'mode', 'challenge') = 'challenge' and (p->>'passed') = 'true'
     and coalesce((p->>'score')::numeric, 0) < 80 then return 'pass without a passing score'; end if;

  if p ? 'points' and jsonb_typeof(p->'points') <> 'null' then
    if jsonb_typeof(p->'points') <> 'object' then return 'bad points'; end if;
    foreach k in array array['accuracy', 'payment', 'corrections', 'speed'] loop
      if p->'points' ? k and jsonb_typeof(p->'points'->k) <> 'number' then return 'bad points'; end if;
    end loop;
  end if;
  foreach f in array array['events', 'mistakes', 'feedback', 'expected', 'rung', 'skills'] loop
    if p ? f and jsonb_typeof(p->f) not in ('array', 'null') then return 'bad ' || f; end if;
  end loop;
  if jsonb_typeof(p->'events') = 'array' and jsonb_array_length(p->'events') > 5000 then return 'too many events'; end if;
  return null;
end $$;

create or replace function save_attempt(p jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  org uuid;
  problem text := attempt_problem(p);
begin
  if problem is not null then
    raise exception 'invalid attempt: %', problem using errcode = '22023';
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
    (p->>'score')::numeric::int, (p->>'passed')::boolean, (p->>'seconds')::numeric,
    (p->>'startedAt')::timestamptz, (p->>'finishedAt')::timestamptz, p)
  on conflict (id) do nothing;   -- re-sending the same attempt is harmless
  return p->>'id';
end $$;

-- Only these three functions are callable from the website.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function save_attempt(jsonb) to anon;
grant execute on function manager_attempts(text) to anon;
grant execute on function manager_clear(text) to anon;
