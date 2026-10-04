-- RLS and grant checks for M2-3 (step_progress; ADR-019). Run as postgres,
-- e.g. through the Supabase MCP execute_sql tool, after
-- m2_2_roadmaps_rls.sql. Everything happens in one transaction that is
-- rolled back: the test users and their rows never persist. Every row of
-- the final result must have ok = true.

begin;

create temp table results (n serial, check_name text, ok boolean, detail text);
grant insert, select on results to public;
grant usage on sequence results_n_seq to public;

-- Two throwaway users, each with a roadmap. A has two steps, B has one,
-- and B has already completed theirs.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated');
insert into public.quiz_submissions (id, user_id, answers, answers_version) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '{"goal":"y"}', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '{"goal":"x"}', 2);
insert into public.roadmaps (id, user_id, quiz_submission_id, career) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Web Developer'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 'Data Analyst');
insert into public.roadmap_steps (id, roadmap_id, user_id, position, title) values
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 0, 'HTML'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 1, 'CSS'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', 0, 'SQL');
insert into public.step_progress (step_id, user_id) values
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000b');

-- ---------------------------------------------------------------------
-- Browser (authenticated) as user A
do $$
declare n int; ts timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

  select count(*) into n from public.step_progress;
  insert into results (check_name, ok, detail) values ('A sees none of B''s progress', n = 0, n::text);

  insert into public.step_progress (step_id, user_id) values
    ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a');
  select completed_at into ts from public.step_progress where step_id = '00000000-0000-4000-8000-0000000000a3';
  insert into results (check_name, ok, detail) values
    ('A can mark own step done; completed_at defaults to the database time', ts = now(), ts::text);

  -- What the dashboard reads: steps with their progress.
  select count(p.step_id) into n
    from public.roadmap_steps s left join public.step_progress p on p.step_id = s.id
   where s.roadmap_id = '00000000-0000-4000-8000-0000000000a2';
  insert into results (check_name, ok, detail) values ('A reads own steps with their progress', n = 1, n::text);

  begin
    insert into public.step_progress (step_id, user_id) values
      ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a');
    insert into results (check_name, ok) values ('the same step cannot be marked twice', false);
  exception when unique_violation then
    insert into results (check_name, ok) values ('the same step cannot be marked twice', true);
  end;

  begin
    insert into public.step_progress (step_id, user_id, completed_at) values
      ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000000a', now() - interval '30 days');
    insert into results (check_name, ok) values ('the browser cannot backdate completed_at', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot backdate completed_at', true);
  end;

  begin
    insert into public.step_progress (step_id, user_id) values
      ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000a');
    insert into results (check_name, ok) values ('A cannot add progress for B''s step with own user_id (foreign key)', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('A cannot add progress for B''s step with own user_id (foreign key)', true);
  end;

  begin
    insert into public.step_progress (step_id, user_id) values
      ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000b');
    insert into results (check_name, ok) values ('A cannot add progress for B''s step with B''s user_id (RLS)', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('A cannot add progress for B''s step with B''s user_id (RLS)', true);
  end;

  begin
    update public.step_progress set completed_at = now() - interval '1 day';
    insert into results (check_name, ok) values ('the browser cannot update progress', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot update progress', true);
  end;

  delete from public.step_progress where step_id = '00000000-0000-4000-8000-0000000000b3';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A cannot delete B''s progress', n = 0, n || ' rows');

  delete from public.step_progress where step_id = '00000000-0000-4000-8000-0000000000a3';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A can unmark own step', n = 1, n || ' rows');

  insert into public.step_progress (step_id, user_id) values
    ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a');
  insert into results (check_name, ok) values ('A can mark the step again after undo', true);

  reset role;
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.step_progress where step_id = '00000000-0000-4000-8000-0000000000b3';
  insert into results (check_name, ok, detail) values ('B''s progress is still there', n = 1, n::text);
end $$;

-- ---------------------------------------------------------------------
-- anon gets nothing
do $$
begin
  begin
    set local role anon;
    perform count(*) from public.step_progress;
    reset role;
    insert into results (check_name, ok) values ('anon cannot read step_progress', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot read step_progress', true);
  end;
  begin
    set local role anon;
    insert into public.step_progress (step_id, user_id) values
      ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000000a');
    reset role;
    insert into results (check_name, ok) values ('anon cannot insert step_progress', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot insert step_progress', true);
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
  select count(*) into n from public.step_progress;
  reset role;
  insert into results (check_name, ok, detail) values ('pathwayai_api without claims sees no progress', n = 0, n::text);
end $$;

do $$
declare n int; ts timestamptz;
begin
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);

  select count(*) into n from public.step_progress where user_id = '00000000-0000-4000-8000-00000000000b';
  insert into results (check_name, ok, detail) values ('pathwayai_api as A sees none of B''s progress', n = 0, n::text);

  insert into public.step_progress (step_id, user_id, completed_at) values
    ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000000a', '2026-09-01T12:00:00Z');
  select completed_at into ts from public.step_progress where step_id = '00000000-0000-4000-8000-0000000000a4';
  insert into results (check_name, ok, detail) values
    ('pathwayai_api can import a completion with its original time', ts = '2026-09-01T12:00:00Z', ts::text);

  begin
    insert into public.step_progress (step_id, user_id) values
      ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000a');
    insert into results (check_name, ok) values ('pathwayai_api as A cannot add progress for B''s step', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('pathwayai_api as A cannot add progress for B''s step', true);
  end;

  begin
    delete from public.step_progress;
    insert into results (check_name, ok) values ('pathwayai_api cannot delete progress', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot delete progress', true);
  end;

  begin
    update public.step_progress set completed_at = now();
    insert into results (check_name, ok) values ('pathwayai_api cannot update progress', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot update progress', true);
  end;

  reset role;
end $$;

-- ---------------------------------------------------------------------
-- Cascades: deleting a roadmap removes its steps and progress; deleting an
-- account removes everything of that user.
do $$
declare n int;
begin
  delete from public.roadmaps where id = '00000000-0000-4000-8000-0000000000a2';
  select (select count(*) from public.roadmap_steps where roadmap_id = '00000000-0000-4000-8000-0000000000a2')
       + (select count(*) from public.step_progress where user_id = '00000000-0000-4000-8000-00000000000a')
    into n;
  insert into results (check_name, ok, detail) values ('deleting a roadmap removes its steps and progress', n = 0, n::text);

  delete from auth.users where id = '00000000-0000-4000-8000-00000000000b';
  select count(*) into n from public.step_progress where user_id = '00000000-0000-4000-8000-00000000000b';
  insert into results (check_name, ok, detail) values ('deleting a user removes their progress', n = 0, n::text);
end $$;

select n, check_name, ok, detail from results order by n;

rollback;
