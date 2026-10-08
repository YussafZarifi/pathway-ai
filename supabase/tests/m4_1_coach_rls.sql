-- RLS, grant and constraint checks for M4-1 (coach_threads, coach_messages;
-- ADR-021). Run as postgres, e.g. through the Supabase MCP execute_sql tool.
-- Everything happens in one transaction that is rolled back: the test users
-- and their rows never persist. Every row of the final result must have
-- ok = true.

begin;

create temp table results (n serial, check_name text, ok boolean, detail text);
grant insert, select on results to public;
grant usage on sequence results_n_seq to public;

-- Two throwaway users, each with a roadmap; B already has a thread.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated');
insert into public.quiz_submissions (id, user_id, answers, answers_version) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '{"goal":"y"}', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '{"goal":"x"}', 2);
insert into public.roadmaps (id, user_id, quiz_submission_id, career) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Web Developer'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 'Data Analyst');
insert into public.coach_threads (id, user_id, roadmap_id, title) values
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b2', 'B thread');
insert into public.coach_messages (thread_id, user_id, role, content) values
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000000b', 'user', 'B question');

-- ---------------------------------------------------------------------
-- Browser (authenticated) as user A
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

  select (select count(*) from public.coach_threads) + (select count(*) from public.coach_messages) into n;
  insert into results (check_name, ok, detail) values ('A sees none of B''s threads or messages', n = 0, n::text);

  begin
    insert into public.coach_threads (user_id, title) values ('00000000-0000-4000-8000-00000000000a', 'Mine');
    insert into results (check_name, ok) values ('the browser cannot create threads', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot create threads', true);
  end;

  begin
    insert into public.coach_messages (thread_id, user_id, role, content)
      values ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000000a', 'assistant', 'forged');
    insert into results (check_name, ok) values ('the browser cannot write messages', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot write messages', true);
  end;

  begin
    update public.coach_threads set title = 'Changed';
    insert into results (check_name, ok) values ('the browser cannot update threads', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot update threads', true);
  end;

  begin
    delete from public.coach_messages;
    insert into results (check_name, ok) values ('the browser cannot delete single messages', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot delete single messages', true);
  end;

  delete from public.coach_threads where id = '00000000-0000-4000-8000-0000000000b6';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A cannot delete B''s thread', n = 0, n || ' rows');

  reset role;
end $$;

do $$
declare n int;
begin
  select (select count(*) from public.coach_threads where user_id = '00000000-0000-4000-8000-00000000000b')
       + (select count(*) from public.coach_messages where user_id = '00000000-0000-4000-8000-00000000000b') into n;
  insert into results (check_name, ok, detail) values ('B''s thread and message are still there', n = 2, n::text);
end $$;

-- ---------------------------------------------------------------------
-- anon gets nothing
do $$
declare t text;
begin
  foreach t in array array['coach_threads', 'coach_messages'] loop
    begin
      set local role anon;
      execute format('select count(*) from public.%I', t);
      reset role;
      insert into results (check_name, ok) values ('anon cannot read ' || t, false);
    exception when insufficient_privilege then
      reset role;
      insert into results (check_name, ok) values ('anon cannot read ' || t, true);
    end;
  end loop;
  begin
    set local role anon;
    delete from public.coach_threads;
    reset role;
    insert into results (check_name, ok) values ('anon cannot delete threads', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot delete threads', true);
  end;
end $$;

-- ---------------------------------------------------------------------
-- FastAPI (pathwayai_api)
do $$
declare n int;
begin
  set local role pathwayai_api;
  -- Earlier blocks set claims for the rest of the transaction; clear them.
  perform set_config('request.jwt.claims', '', true);
  select (select count(*) from public.coach_threads) + (select count(*) from public.coach_messages) into n;
  reset role;
  insert into results (check_name, ok, detail) values ('pathwayai_api without claims sees nothing', n = 0, n::text);
end $$;

do $$
declare n int; before_ts timestamptz; after_ts timestamptz;
begin
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);

  select (select count(*) from public.coach_threads) + (select count(*) from public.coach_messages) into n;
  insert into results (check_name, ok, detail) values ('pathwayai_api as A sees none of B''s rows', n = 0, n::text);

  insert into public.coach_threads (id, user_id, roadmap_id, title) values
    ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 'How do I start?');
  insert into public.coach_messages (thread_id, user_id, role, content) values
    ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'user', 'How do I start?');
  insert into public.coach_messages (thread_id, user_id, role, content, actions) values
    ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'assistant', 'Start with step 1.',
     '[{"type":"open_step","step":1}]');
  insert into results (check_name, ok) values ('pathwayai_api as A saves a thread with both messages', true);

  insert into public.coach_threads (user_id, title) values ('00000000-0000-4000-8000-00000000000a', 'No roadmap');
  insert into results (check_name, ok) values ('a thread without a roadmap is allowed', true);

  select updated_at into before_ts from public.coach_threads where id = '00000000-0000-4000-8000-0000000000a6';
  update public.coach_threads set updated_at = now() where id = '00000000-0000-4000-8000-0000000000a6';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('pathwayai_api can bump updated_at of A''s thread', n = 1, n || ' rows');

  update public.coach_threads set updated_at = now() where id = '00000000-0000-4000-8000-0000000000b6';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('pathwayai_api as A cannot touch B''s thread', n = 0, n || ' rows');

  begin
    update public.coach_threads set title = 'Changed' where id = '00000000-0000-4000-8000-0000000000a6';
    insert into results (check_name, ok) values ('pathwayai_api cannot change a title', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot change a title', true);
  end;

  begin
    update public.coach_threads set user_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000a6';
    insert into results (check_name, ok) values ('pathwayai_api cannot move a thread to another user', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot move a thread to another user', true);
  end;

  begin
    update public.coach_messages set content = 'edited';
    insert into results (check_name, ok) values ('pathwayai_api cannot edit messages', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot edit messages', true);
  end;

  begin
    delete from public.coach_threads;
    insert into results (check_name, ok) values ('pathwayai_api cannot delete threads', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot delete threads', true);
  end;

  begin
    insert into public.coach_threads (user_id, title) values ('00000000-0000-4000-8000-00000000000b', 'Spoof');
    insert into results (check_name, ok) values ('pathwayai_api as A cannot create a thread for B (RLS)', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api as A cannot create a thread for B (RLS)', true);
  end;

  begin
    insert into public.coach_threads (user_id, roadmap_id, title)
      values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b2', 'Borrowed');
    insert into results (check_name, ok) values ('a thread cannot point at another user''s roadmap (foreign key)', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('a thread cannot point at another user''s roadmap (foreign key)', true);
  end;

  begin
    insert into public.coach_messages (thread_id, user_id, role, content)
      values ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000000a', 'user', 'Into B');
    insert into results (check_name, ok) values ('a message cannot join another user''s thread (foreign key)', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('a message cannot join another user''s thread (foreign key)', true);
  end;

  begin
    insert into public.coach_messages (thread_id, user_id, role, content)
      values ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000000b', 'user', 'Into B');
    insert into results (check_name, ok) values ('a message for B is refused for A (RLS)', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('a message for B is refused for A (RLS)', true);
  end;

  -- Constraints
  begin
    insert into public.coach_messages (thread_id, user_id, role, content)
      values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'system', 'x');
    insert into results (check_name, ok) values ('role must be user or assistant', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('role must be user or assistant', true);
  end;
  begin
    insert into public.coach_messages (thread_id, user_id, role, content)
      values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'user', '');
    insert into results (check_name, ok) values ('empty message is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('empty message is rejected', true);
  end;
  begin
    insert into public.coach_messages (thread_id, user_id, role, content)
      values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'user', repeat('x', 4001));
    insert into results (check_name, ok) values ('message over 4,000 characters is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('message over 4,000 characters is rejected', true);
  end;
  begin
    insert into public.coach_messages (thread_id, user_id, role, content, actions)
      values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'user', 'x', '[{"type":"take_quiz"}]');
    insert into results (check_name, ok) values ('user messages carry no actions', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('user messages carry no actions', true);
  end;
  begin
    insert into public.coach_messages (thread_id, user_id, role, content, actions)
      values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'assistant', 'x', '{"type":"take_quiz"}');
    insert into results (check_name, ok) values ('actions must be an array', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('actions must be an array', true);
  end;
  begin
    insert into public.coach_messages (thread_id, user_id, role, content, actions)
      values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'assistant', 'x',
              jsonb_build_array(repeat('x', 2100)));
    insert into results (check_name, ok) values ('actions over 2 KB are rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('actions over 2 KB are rejected', true);
  end;
  begin
    insert into public.coach_threads (user_id, title) values ('00000000-0000-4000-8000-00000000000a', repeat('t', 81));
    insert into results (check_name, ok) values ('title over 80 characters is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('title over 80 characters is rejected', true);
  end;

  reset role;
end $$;

-- The browser reads its history and deletes a whole thread.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select count(*) into n from public.coach_messages where thread_id = '00000000-0000-4000-8000-0000000000a6';
  insert into results (check_name, ok, detail) values ('A reads own thread''s messages', n = 2, n::text);
  select count(*) into n from public.coach_threads;
  insert into results (check_name, ok, detail) values ('A lists own threads', n = 2, n::text);
  delete from public.coach_threads where id = '00000000-0000-4000-8000-0000000000a6';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A deletes own thread', n = 1, n || ' rows');
  select count(*) into n from public.coach_messages;
  insert into results (check_name, ok, detail) values ('the thread''s messages went with it', n = 0, n::text);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- Cleanup behaviour (as the table owner)
do $$
declare n int; rid uuid;
begin
  delete from public.roadmaps where id = '00000000-0000-4000-8000-0000000000b2';
  select roadmap_id into rid from public.coach_threads where id = '00000000-0000-4000-8000-0000000000b6';
  select count(*) into n from public.coach_messages where thread_id = '00000000-0000-4000-8000-0000000000b6';
  insert into results (check_name, ok, detail) values
    ('deleting a roadmap keeps its threads (roadmap_id cleared)', rid is null and n = 1, coalesce(rid::text, 'null') || ' / ' || n);

  delete from auth.users where id = '00000000-0000-4000-8000-00000000000b';
  select (select count(*) from public.coach_threads where user_id = '00000000-0000-4000-8000-00000000000b')
       + (select count(*) from public.coach_messages where user_id = '00000000-0000-4000-8000-00000000000b') into n;
  insert into results (check_name, ok, detail) values ('deleting a user removes their threads and messages', n = 0, n::text);
end $$;

select n, check_name, ok, detail from results order by n;

rollback;
