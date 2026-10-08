-- Personal step notes and target dates (PathwayAI, 2026-10-07).
-- User-owned state, like step_progress (ADR-019): the browser writes it
-- through RLS; FastAPI may only read it (data export, coach context).
-- A row exists only while it holds a note or a target date.

create table public.step_notes (
  step_id uuid not null,
  user_id uuid not null,
  note text not null default '' check (char_length(note) <= 2000),
  target_date date check (target_date between date '2020-01-01' and date '2100-12-31'),
  updated_at timestamptz not null default now(),
  primary key (step_id, user_id),
  -- Only on the user's own steps; removed with the step (and its roadmap).
  foreign key (step_id, user_id) references public.roadmap_steps (id, user_id) on delete cascade,
  check (note <> '' or target_date is not null)
);

comment on table public.step_notes is 'Personal notes and target dates per roadmap step; written by their owner through RLS, read by pathwayai_api.';

-- Reminders: a user's dated steps.
create index step_notes_user_target_idx on public.step_notes (user_id, target_date) where target_date is not null;

create trigger step_notes_set_updated_at
  before update on public.step_notes
  for each row execute function private.set_updated_at();

alter table public.step_notes enable row level security;

create policy "Owners can read their step notes"
  on public.step_notes for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add step notes"
  on public.step_notes for insert
  to authenticated
  with check (user_id = (select private.request_user_id()));

create policy "Owners can update their step notes"
  on public.step_notes for update
  to authenticated
  using (user_id = (select private.request_user_id()))
  with check (user_id = (select private.request_user_id()));

create policy "Owners can delete their step notes"
  on public.step_notes for delete
  to authenticated
  using (user_id = (select private.request_user_id()));

revoke all on public.step_notes from public, anon, authenticated;

-- Browser: read, add, edit (text and date only) and remove its own notes.
grant select, delete on public.step_notes to authenticated;
grant insert (step_id, user_id, note, target_date) on public.step_notes to authenticated;
grant update (note, target_date) on public.step_notes to authenticated;

-- FastAPI: read only.
grant select on public.step_notes to pathwayai_api;
