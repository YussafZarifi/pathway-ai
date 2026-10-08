-- AI Coach storage (PathwayAI Milestone 4, M4-1, ADR-021).
-- A thread per conversation and its messages. Written only by FastAPI as
-- pathwayai_api (AI content and the prompts that produced it, ADR-019 rule);
-- the browser reads its own threads and messages and may delete a thread
-- (its messages go with it). Messages are never edited.

create table public.coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The roadmap the conversation was about. Optional so a thread survives
  -- when its roadmap is deleted.
  roadmap_id uuid,
  title text not null check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target for coach_messages' composite foreign key.
  unique (id, user_id),
  foreign key (roadmap_id, user_id) references public.roadmaps (id, user_id)
    on delete set null (roadmap_id)
);

comment on table public.coach_threads is 'AI Coach conversations; written by pathwayai_api, read and deleted by their owner (ADR-021).';

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  -- Suggested actions of an assistant message (validated by FastAPI);
  -- always an empty array for user messages.
  actions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(actions) = 'array' and octet_length(actions::text) <= 2048
           and (role = 'assistant' or actions = '[]'::jsonb)),
  created_at timestamptz not null default now(),
  -- The thread must belong to the same user; deleting it removes its messages.
  foreign key (thread_id, user_id) references public.coach_threads (id, user_id) on delete cascade
);

comment on table public.coach_messages is 'AI Coach messages (user and assistant); written by pathwayai_api, read by their owner (ADR-021).';

-- Thread list, most recent first.
create index coach_threads_user_updated_idx on public.coach_threads (user_id, updated_at desc);
-- Covers the composite foreign key to roadmaps.
create index coach_threads_roadmap_user_idx on public.coach_threads (roadmap_id, user_id);
-- A thread's messages in order (also covers the foreign key to threads).
create index coach_messages_thread_created_idx on public.coach_messages (thread_id, user_id, created_at);

create trigger coach_threads_set_updated_at
  before update on public.coach_threads
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Row-level security: one policy per operation, shared by the browser and
-- FastAPI (private.request_user_id(), ADR-019 amendment). Grants below
-- decide which role may use which operation.
alter table public.coach_threads enable row level security;
alter table public.coach_messages enable row level security;

create policy "Owners can read their coach threads"
  on public.coach_threads for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add coach threads"
  on public.coach_threads for insert
  to authenticated, pathwayai_api
  with check (user_id = (select private.request_user_id()));

create policy "Owners can update their coach threads"
  on public.coach_threads for update
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()))
  with check (user_id = (select private.request_user_id()));

create policy "Owners can delete their coach threads"
  on public.coach_threads for delete
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can read their coach messages"
  on public.coach_messages for select
  to authenticated, pathwayai_api
  using (user_id = (select private.request_user_id()));

create policy "Owners can add coach messages"
  on public.coach_messages for insert
  to authenticated, pathwayai_api
  with check (user_id = (select private.request_user_id()));

-- ---------------------------------------------------------------------
-- Explicit grants. Supabase's default privileges give anon and
-- authenticated full access to new public tables, so revoke first.
revoke all on public.coach_threads, public.coach_messages from public, anon, authenticated;

-- Browser: read its own conversations; delete a whole thread.
grant select, delete on public.coach_threads to authenticated;
grant select on public.coach_messages to authenticated;

-- FastAPI: create threads and messages, bump a thread's updated_at; it
-- never edits content or deletes anything.
grant select, insert on public.coach_threads, public.coach_messages to pathwayai_api;
grant update (updated_at) on public.coach_threads to pathwayai_api;
