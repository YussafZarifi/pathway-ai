-- RLS and grant checks for M2-2 (quiz_submissions, roadmaps, roadmap_steps;
-- ADR-019). Run as postgres, e.g. through the Supabase MCP execute_sql tool.
-- Everything happens in one transaction that is rolled back: the two test
-- users and their rows never persist. Every row of the final result must
-- have ok = true.

begin;

create temp table results (n serial, check_name text, ok boolean, detail text);
grant insert, select on results to public;
grant usage on sequence results_n_seq to public;

-- Two throwaway users (the sign-up trigger also creates their profiles).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated');

-- B's data, inserted as the table owner.
insert into public.quiz_submissions (id, user_id, answers, answers_version) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '{"goal":"x"}', 2);
insert into public.roadmaps (id, user_id, quiz_submission_id, career) values
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 'Data Analyst');
insert into public.roadmap_steps (roadmap_id, user_id, position, title) values
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', 0, 'B step');

-- ---------------------------------------------------------------------
-- Browser (authenticated) as user A
do $$
declare n_roadmaps int; n_steps int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
  select count(*) into n_roadmaps from public.roadmaps;
  select count(*) into n_steps from public.roadmap_steps;
  insert into results (check_name, ok, detail) values
    ('authenticated A sees none of B''s roadmaps or steps', n_roadmaps = 0 and n_steps = 0, n_roadmaps || '/' || n_steps);
  reset role;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  begin
    perform count(*) from public.quiz_submissions;
    insert into results (check_name, ok) values ('authenticated cannot read quiz_submissions', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('authenticated cannot read quiz_submissions', true);
  end;
  begin
    insert into public.quiz_submissions (user_id, answers, answers_version)
      values ('00000000-0000-4000-8000-00000000000a', '{}', 2);
    insert into results (check_name, ok) values ('authenticated cannot insert quiz_submissions', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('authenticated cannot insert quiz_submissions', true);
  end;
  begin
    insert into public.roadmaps (user_id, career, source) values ('00000000-0000-4000-8000-00000000000a', 'Fake', 'imported');
    insert into results (check_name, ok) values ('authenticated cannot insert roadmaps', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('authenticated cannot insert roadmaps', true);
  end;
  begin
    update public.roadmaps set status = 'archived';
    insert into results (check_name, ok) values ('authenticated cannot update roadmaps', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('authenticated cannot update roadmaps', true);
  end;
  begin
    delete from public.roadmaps;
    insert into results (check_name, ok) values ('authenticated cannot delete roadmaps', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('authenticated cannot delete roadmaps', true);
  end;
  begin
    insert into public.roadmap_steps (roadmap_id, user_id, position, title)
      values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000a', 1, 'Fake');
    insert into results (check_name, ok) values ('authenticated cannot insert roadmap_steps', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('authenticated cannot insert roadmap_steps', true);
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- anon gets nothing
do $$
declare t text;
begin
  foreach t in array array['quiz_submissions', 'roadmaps', 'roadmap_steps'] loop
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
end $$;

-- ---------------------------------------------------------------------
-- FastAPI (pathwayai_api)
do $$
declare n int;
begin
  set local role pathwayai_api;
  select count(*) into n from public.roadmaps;
  reset role;
  insert into results (check_name, ok, detail) values ('pathwayai_api without claims sees no rows', n = 0, n::text);
end $$;

do $$
declare n_sub int; n_roadmaps int; n_steps int;
begin
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select count(*) into n_sub from public.quiz_submissions;
  select count(*) into n_roadmaps from public.roadmaps;
  select count(*) into n_steps from public.roadmap_steps;
  reset role;
  insert into results (check_name, ok, detail) values
    ('pathwayai_api as A sees none of B''s rows', n_sub + n_roadmaps + n_steps = 0, n_sub || '/' || n_roadmaps || '/' || n_steps);
end $$;

-- The normal generation flow for A: submission, roadmap, steps.
do $$
begin
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  insert into public.quiz_submissions (id, user_id, answers, answers_version) values
    ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '{"goal":"y"}', 2);
  insert into public.roadmaps (id, user_id, quiz_submission_id, career, prompt_version) values
    ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Web Developer', 'v2');
  insert into public.roadmap_steps (roadmap_id, user_id, position, title, tasks) values
    ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 0, 'HTML', '["one"]'),
    ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 1, 'CSS', '[]');
  reset role;
  insert into results (check_name, ok) values ('pathwayai_api as A can save a submission, roadmap and steps', true);
exception when others then
  reset role;
  insert into results (check_name, ok, detail) values ('pathwayai_api as A can save a submission, roadmap and steps', false, sqlerrm);
end $$;

do $$
declare n_roadmaps int; n_steps int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select count(*) into n_roadmaps from public.roadmaps;
  select count(*) into n_steps from public.roadmap_steps;
  reset role;
  insert into results (check_name, ok, detail) values
    ('authenticated A reads own roadmap and steps', n_roadmaps = 1 and n_steps = 2, n_roadmaps || '/' || n_steps);
end $$;

do $$
declare n int;
begin
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);

  begin
    insert into public.roadmaps (user_id, career, source) values ('00000000-0000-4000-8000-00000000000b', 'Spoof', 'imported');
    insert into results (check_name, ok) values ('pathwayai_api as A cannot insert a roadmap for B', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api as A cannot insert a roadmap for B', true);
  end;

  begin
    insert into public.roadmaps (user_id, career, source) values ('00000000-0000-4000-8000-00000000000a', 'Second', 'imported');
    insert into results (check_name, ok) values ('a second active roadmap for A is rejected', false);
  exception when unique_violation then
    insert into results (check_name, ok) values ('a second active roadmap for A is rejected', true);
  end;

  begin
    insert into public.roadmap_steps (roadmap_id, user_id, position, title)
      values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000a', 5, 'Into B');
    insert into results (check_name, ok) values ('a step cannot reference another user''s roadmap (own user_id)', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('a step cannot reference another user''s roadmap (own user_id)', true);
  end;

  begin
    insert into public.roadmap_steps (roadmap_id, user_id, position, title)
      values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', 5, 'Into B');
    insert into results (check_name, ok) values ('a step cannot reference another user''s roadmap (their user_id)', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('a step cannot reference another user''s roadmap (their user_id)', true);
  end;

  begin
    insert into public.roadmaps (user_id, quiz_submission_id, career, status)
      values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b1', 'Borrowed', 'archived');
    insert into results (check_name, ok) values ('a roadmap cannot use another user''s quiz submission', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('a roadmap cannot use another user''s quiz submission', true);
  end;

  begin
    insert into public.roadmaps (user_id, career, status) values ('00000000-0000-4000-8000-00000000000a', 'No answers', 'archived');
    insert into results (check_name, ok) values ('a generated roadmap needs a quiz submission', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('a generated roadmap needs a quiz submission', true);
  end;

  begin
    insert into public.roadmap_steps (roadmap_id, user_id, position, title)
      values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 1, 'Duplicate position');
    insert into results (check_name, ok) values ('two steps cannot share a position', false);
  exception when unique_violation then
    insert into results (check_name, ok) values ('two steps cannot share a position', true);
  end;

  begin
    insert into public.roadmap_steps (roadmap_id, user_id, position, title, tasks)
      values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 4, 'Oversized', to_jsonb(array[repeat('x', 9000)]));
    insert into results (check_name, ok) values ('oversized step content is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('oversized step content is rejected', true);
  end;

  update public.roadmaps set status = 'archived' where id = '00000000-0000-4000-8000-0000000000b2';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('pathwayai_api as A cannot update B''s roadmap', n = 0, n || ' rows');

  begin
    update public.roadmaps set career = 'Changed' where id = '00000000-0000-4000-8000-0000000000a2';
    insert into results (check_name, ok) values ('pathwayai_api can only change status', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api can only change status', true);
  end;

  begin
    update public.roadmaps set user_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000a2';
    insert into results (check_name, ok) values ('pathwayai_api cannot move a roadmap to another user', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot move a roadmap to another user', true);
  end;

  begin
    delete from public.roadmaps;
    insert into results (check_name, ok) values ('pathwayai_api cannot delete roadmaps', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot delete roadmaps', true);
  end;

  begin
    perform count(*) from public.profiles;
    insert into results (check_name, ok) values ('pathwayai_api cannot read profiles', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot read profiles', true);
  end;

  begin
    perform count(*) from auth.users;
    insert into results (check_name, ok) values ('pathwayai_api cannot read auth.users', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot read auth.users', true);
  end;

  reset role;
end $$;

-- Regenerate: archive the active roadmap, then insert the new one; an
-- import with an already used local_id is rejected.
do $$
begin
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  update public.roadmaps set status = 'archived' where id = '00000000-0000-4000-8000-0000000000a2';
  insert into public.roadmaps (user_id, quiz_submission_id, career) values
    ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Web Developer');
  insert into public.roadmaps (user_id, career, source, status, local_id) values
    ('00000000-0000-4000-8000-00000000000a', 'Imported', 'imported', 'archived', 'local-1');
  begin
    insert into public.roadmaps (user_id, career, source, status, local_id) values
      ('00000000-0000-4000-8000-00000000000a', 'Imported again', 'imported', 'archived', 'local-1');
    insert into results (check_name, ok) values ('the same local_id cannot be imported twice', false);
  exception when unique_violation then
    insert into results (check_name, ok) values ('the same local_id cannot be imported twice', true);
  end;
  reset role;
  -- Also proves the updated_at trigger runs for pathwayai_api.
  insert into results (check_name, ok) values ('regenerate: archive then insert a new active roadmap', true);
exception when others then
  reset role;
  insert into results (check_name, ok, detail) values ('regenerate: archive then insert a new active roadmap', false, sqlerrm);
end $$;

-- Deleting an account removes all of its rows.
do $$
declare n int;
begin
  delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';
  select (select count(*) from public.quiz_submissions where user_id = '00000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.roadmaps where user_id = '00000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.roadmap_steps where user_id = '00000000-0000-4000-8000-00000000000a')
    into n;
  insert into results (check_name, ok, detail) values ('deleting a user removes their rows', n = 0, n::text);
end $$;

select n, check_name, ok, detail from results order by n;

rollback;
