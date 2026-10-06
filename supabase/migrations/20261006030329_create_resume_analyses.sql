-- Resume Analyzer storage (PathwayAI Milestone 3, M3-2, ADR-020).
-- One row per analysis. Only the structured analysis is stored: never the
-- PDF, its text, its file name or a hash of it. Written only by FastAPI as
-- pathwayai_api (AI content, ADR-019 rule); the browser reads its own
-- analyses and may delete them (user-controlled history, ADR-020 D).

create table public.resume_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The roadmap whose career was the target. Optional so an analysis
  -- survives when its roadmap is deleted; the career is kept below.
  roadmap_id uuid,
  career text not null check (char_length(career) between 1 and 100),
  analysis jsonb not null
    check (jsonb_typeof(analysis) = 'object' and octet_length(analysis::text) <= 16384),
  prompt_version text not null check (char_length(prompt_version) between 1 and 20),
  model text not null check (char_length(model) between 1 and 100),
  created_at timestamptz not null default now(),
  -- The roadmap must belong to the same user. Deleting the roadmap clears
  -- only roadmap_id (the column list keeps user_id intact).
  foreign key (roadmap_id, user_id) references public.roadmaps (id, user_id)
    on delete set null (roadmap_id)
);

comment on table public.resume_analyses is 'Structured résumé analyses (no files, no résumé text); written by pathwayai_api, read and deleted by their owner (ADR-020).';

-- History, newest first.
create index resume_analyses_user_created_idx
  on public.resume_analyses (user_id, created_at desc);

-- Covers the composite foreign key to roadmaps.
create index resume_analyses_roadmap_user_idx
  on public.resume_analyses (roadmap_id, user_id);

-- ---------------------------------------------------------------------
-- Row-level security: one policy per operation, shared by the browser and
-- FastAPI (private.request_user_id(), ADR-019 amendment). Grants below
-- decide which role may use which operation; nobody may update.
alter table public.resume_analyses enable row level security;

create policy "Owners can read their resume analyses"
  on public.resume_analyses for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add resume analyses"
  on public.resume_analyses for insert
  to authenticated, pathwayai_api
  with check (user_id = (select private.request_user_id()));

create policy "Owners can delete their resume analyses"
  on public.resume_analyses for delete
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

-- ---------------------------------------------------------------------
-- Explicit grants. Supabase's default privileges give anon and
-- authenticated full access to new public tables, so revoke first.
revoke all on public.resume_analyses from public, anon, authenticated;

-- Browser: read and delete its own analyses; it never creates them.
grant select, delete on public.resume_analyses to authenticated;

-- FastAPI: save analyses; it never edits or deletes them.
grant select, insert on public.resume_analyses to pathwayai_api;
