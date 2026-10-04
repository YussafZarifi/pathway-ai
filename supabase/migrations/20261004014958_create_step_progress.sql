-- Roadmaps in PostgreSQL, part 2 (PathwayAI Milestone 2, M2-3, ADR-019):
-- step progress. User-owned state: the browser marks and unmarks its own
-- steps directly through RLS; FastAPI (pathwayai_api) adds completions
-- only when importing a browser-saved roadmap.

-- A row means "this step is done"; undo deletes the row.
create table public.step_progress (
  step_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  -- One row per step: a step belongs to exactly one user, so (step_id,
  -- user_id) is unique per step. Also serves as the index for the
  -- composite foreign key below.
  primary key (step_id, user_id),
  -- Progress can only point at one of the user's own steps; deleting a
  -- step (or its roadmap, or the account) removes its progress.
  foreign key (step_id, user_id) references public.roadmap_steps (id, user_id) on delete cascade
);

comment on table public.step_progress is 'Completed roadmap steps; marked/unmarked by their owner through RLS, added by pathwayai_api on import (ADR-019).';

-- Activity, streak and achievements are derived from completions per user.
create index step_progress_user_completed_idx
  on public.step_progress (user_id, completed_at desc);

-- ---------------------------------------------------------------------
-- Row-level security: one policy per operation, shared by the browser and
-- FastAPI (private.request_user_id(), ADR-019 amendment 2026-10-03).
alter table public.step_progress enable row level security;

create policy "Owners can read their step progress"
  on public.step_progress for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add step progress"
  on public.step_progress for insert
  to authenticated, pathwayai_api
  with check (user_id = (select private.request_user_id()));

create policy "Owners can remove their step progress"
  on public.step_progress for delete
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

-- ---------------------------------------------------------------------
-- Explicit grants. Supabase's default privileges give anon and
-- authenticated full access to new public tables, so revoke first.
revoke all on public.step_progress from public, anon, authenticated;

-- Browser: read, mark (completed_at always defaults to the database
-- time, so it can't be backdated) and unmark its own steps.
grant select, delete on public.step_progress to authenticated;
grant insert (step_id, user_id) on public.step_progress to authenticated;

-- FastAPI: imports keep the original completion time; no update/delete.
grant select, insert on public.step_progress to pathwayai_api;
