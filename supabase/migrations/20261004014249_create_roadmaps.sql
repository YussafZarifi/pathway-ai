-- Roadmaps in PostgreSQL, part 1 (PathwayAI Milestone 2, M2-2, ADR-019):
-- quiz submissions, roadmaps and their steps, written only by FastAPI as
-- the pathwayai_api role; the browser (authenticated) may only read its
-- own roadmaps and steps.

-- ---------------------------------------------------------------------
-- FastAPI's database role. No password here: the owner enables login and
-- sets the password in the Supabase dashboard (M2-4), so it never reaches
-- git. It cannot bypass RLS, inherits nothing and is not a member of
-- authenticated.
create role pathwayai_api nologin noinherit nobypassrls;
comment on role pathwayai_api is 'PathwayAI FastAPI backend: writes AI-generated content under RLS (ADR-019).';

-- Lets the migration owner switch to the role (set role) to run the RLS
-- checks in supabase/tests/; it does not inherit the role's privileges.
grant pathwayai_api to postgres with inherit false, set true;

grant usage on schema public to pathwayai_api;

-- ---------------------------------------------------------------------
-- The user id every policy compares against. Same logic as auth.uid(),
-- which pathwayai_api cannot call: the auth schema belongs to
-- supabase_admin and postgres cannot grant usage on it. For the browser
-- the claims come from PostgREST; for FastAPI they are set per
-- transaction from a token it has already verified. Security invoker,
-- no table access.
create function private.request_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

revoke execute on function private.request_user_id() from public, anon;
grant usage on schema private to authenticated, pathwayai_api;
grant execute on function private.request_user_id() to authenticated, pathwayai_api;

-- ---------------------------------------------------------------------
-- Quiz answers behind each generated roadmap. Server only: the browser
-- has no grant. Needed for "Regenerate" and, later, the AI Coach.
create table public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  answers jsonb not null
    check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 4096),
  answers_version smallint not null check (answers_version in (1, 2)),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

comment on table public.quiz_submissions is 'Quiz answers per generation; written and read only by pathwayai_api (ADR-019).';

create index quiz_submissions_user_created_idx
  on public.quiz_submissions (user_id, created_at desc);

-- ---------------------------------------------------------------------
create table public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quiz_submission_id uuid,
  career text not null check (char_length(career) between 1 and 100),
  career_data jsonb
    check (career_data is null or (jsonb_typeof(career_data) = 'object' and octet_length(career_data::text) <= 4096)),
  prompt_version text check (prompt_version is null or char_length(prompt_version) between 1 and 20),
  source text not null default 'generated' check (source in ('generated', 'imported')),
  status text not null default 'active' check (status in ('active', 'archived')),
  local_id text check (local_id is null or char_length(local_id) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- Imports are idempotent per browser roadmap.
  unique (user_id, local_id),
  -- The submission must belong to the same user.
  foreign key (quiz_submission_id, user_id) references public.quiz_submissions (id, user_id),
  -- Generated roadmaps keep their answers so they can be regenerated.
  check (source = 'imported' or quiz_submission_id is not null)
);

comment on table public.roadmaps is 'One row per saved roadmap; written by pathwayai_api, read by its owner (ADR-019).';

-- At most one current roadmap per user.
create unique index roadmaps_one_active_per_user
  on public.roadmaps (user_id) where status = 'active';

create index roadmaps_user_created_idx
  on public.roadmaps (user_id, created_at desc);

create index roadmaps_quiz_submission_idx
  on public.roadmaps (quiz_submission_id, user_id);

create trigger roadmaps_set_updated_at
  before update on public.roadmaps
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- One row per step, so each step has a stable id for progress and for the
-- AI Coach's tools. Limits match ai_output.RoadmapStep and youtube.py.
create table public.roadmap_steps (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  time_estimate text not null default '' check (char_length(time_estimate) <= 200),
  tasks jsonb not null default '[]'
    check (jsonb_typeof(tasks) = 'array' and octet_length(tasks::text) <= 8192),
  resources jsonb not null default '[]'
    check (jsonb_typeof(resources) = 'array' and octet_length(resources::text) <= 16384),
  video_query text not null default '' check (char_length(video_query) <= 200),
  video_search_url text check (video_search_url is null or char_length(video_search_url) <= 500),
  videos jsonb not null default '[]'
    check (jsonb_typeof(videos) = 'array' and octet_length(videos::text) <= 8192),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  -- A step can only belong to a roadmap of the same user.
  foreign key (roadmap_id, user_id) references public.roadmaps (id, user_id) on delete cascade,
  -- Deferrable so a later migration can let the AI Coach reorder steps
  -- inside one transaction.
  constraint roadmap_steps_roadmap_position_key
    unique (roadmap_id, position) deferrable initially immediate
);

comment on table public.roadmap_steps is 'Steps of a saved roadmap; written by pathwayai_api, read by their owner (ADR-019).';

create index roadmap_steps_roadmap_user_idx
  on public.roadmap_steps (roadmap_id, user_id);

create index roadmap_steps_user_idx
  on public.roadmap_steps (user_id);

-- ---------------------------------------------------------------------
-- Row-level security: one policy per operation, shared by the browser and
-- FastAPI. Grants below decide which role may use which operation.
alter table public.quiz_submissions enable row level security;
alter table public.roadmaps enable row level security;
alter table public.roadmap_steps enable row level security;

create policy "Owners can read their quiz submissions"
  on public.quiz_submissions for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add quiz submissions"
  on public.quiz_submissions for insert
  to authenticated, pathwayai_api
  with check (user_id = (select private.request_user_id()));

create policy "Owners can read their roadmaps"
  on public.roadmaps for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add roadmaps"
  on public.roadmaps for insert
  to authenticated, pathwayai_api
  with check (user_id = (select private.request_user_id()));

create policy "Owners can update their roadmaps"
  on public.roadmaps for update
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()))
  with check (user_id = (select private.request_user_id()));

create policy "Owners can read their roadmap steps"
  on public.roadmap_steps for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add roadmap steps"
  on public.roadmap_steps for insert
  to authenticated, pathwayai_api
  with check (user_id = (select private.request_user_id()));

-- ---------------------------------------------------------------------
-- Explicit grants. Supabase's default privileges give anon and
-- authenticated full access to new public tables, so revoke first.
revoke all on public.quiz_submissions, public.roadmaps, public.roadmap_steps
  from public, anon, authenticated;

-- Browser: read own roadmaps and steps; no access to quiz answers.
grant select on public.roadmaps, public.roadmap_steps to authenticated;

-- FastAPI: write AI content; may only change a roadmap's status.
grant select, insert on public.quiz_submissions to pathwayai_api;
grant select, insert on public.roadmaps to pathwayai_api;
grant update (status) on public.roadmaps to pathwayai_api;
grant select, insert on public.roadmap_steps to pathwayai_api;
