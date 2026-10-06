-- RLS, grant and constraint checks for M3-2 (resume_analyses; ADR-020).
-- Run as postgres, e.g. through the Supabase MCP execute_sql tool. Everything
-- happens in one transaction that is rolled back: the test users and their
-- rows never persist. Every row of the final result must have ok = true.

begin;

create temp table results (n serial, check_name text, ok boolean, detail text);
grant insert, select on results to public;
grant usage on sequence results_n_seq to public;

-- Two throwaway users, each with a roadmap; B already has an analysis.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated');
insert into public.quiz_submissions (id, user_id, answers, answers_version) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '{"goal":"y"}', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '{"goal":"x"}', 2);
insert into public.roadmaps (id, user_id, quiz_submission_id, career) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Web Developer'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 'Data Analyst');
insert into public.resume_analyses (id, user_id, roadmap_id, career, analysis, prompt_version, model) values
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b2',
   'Data Analyst', '{"summary":"B"}', 'r1', 'test-model');

-- ---------------------------------------------------------------------
-- Browser (authenticated) as user A
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

  select count(*) into n from public.resume_analyses;
  insert into results (check_name, ok, detail) values ('A sees none of B''s analyses', n = 0, n::text);

  begin
    insert into public.resume_analyses (user_id, roadmap_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 'Web Developer', '{}', 'r1', 'm');
    insert into results (check_name, ok) values ('the browser cannot create analyses (AI content is server-only)', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot create analyses (AI content is server-only)', true);
  end;

  begin
    update public.resume_analyses set career = 'Changed';
    insert into results (check_name, ok) values ('the browser cannot update analyses', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the browser cannot update analyses', true);
  end;

  delete from public.resume_analyses where id = '00000000-0000-4000-8000-0000000000b5';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A cannot delete B''s analysis', n = 0, n || ' rows');

  reset role;
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.resume_analyses where id = '00000000-0000-4000-8000-0000000000b5';
  insert into results (check_name, ok, detail) values ('B''s analysis is still there', n = 1, n::text);
end $$;

-- ---------------------------------------------------------------------
-- anon gets nothing
do $$
begin
  begin
    set local role anon;
    perform count(*) from public.resume_analyses;
    reset role;
    insert into results (check_name, ok) values ('anon cannot read resume_analyses', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot read resume_analyses', true);
  end;
  begin
    set local role anon;
    delete from public.resume_analyses;
    reset role;
    insert into results (check_name, ok) values ('anon cannot delete resume_analyses', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot delete resume_analyses', true);
  end;
  begin
    set local role anon;
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', 'X', '{}', 'r1', 'm');
    reset role;
    insert into results (check_name, ok) values ('anon cannot insert resume_analyses', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot insert resume_analyses', true);
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
  select count(*) into n from public.resume_analyses;
  reset role;
  insert into results (check_name, ok, detail) values ('pathwayai_api without claims sees no analyses', n = 0, n::text);
end $$;

do $$
declare n int;
begin
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);

  select count(*) into n from public.resume_analyses;
  insert into results (check_name, ok, detail) values ('pathwayai_api as A sees none of B''s analyses', n = 0, n::text);

  insert into public.resume_analyses (id, user_id, roadmap_id, career, analysis, prompt_version, model) values
    ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2',
     'Web Developer', '{"summary":"A","gaps":[]}', 'r1', 'gemini-test');
  insert into results (check_name, ok) values ('pathwayai_api as A saves an analysis of A''s roadmap', true);

  insert into public.resume_analyses (user_id, career, analysis, prompt_version, model) values
    ('00000000-0000-4000-8000-00000000000a', 'Web Developer', '{"summary":"no roadmap"}', 'r1', 'gemini-test');
  insert into results (check_name, ok) values ('an analysis without a roadmap is allowed', true);

  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000b', 'Spoof', '{}', 'r1', 'm');
    insert into results (check_name, ok) values ('pathwayai_api as A cannot save an analysis for B (RLS)', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api as A cannot save an analysis for B (RLS)', true);
  end;

  begin
    insert into public.resume_analyses (user_id, roadmap_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b2', 'Borrowed', '{}', 'r1', 'm');
    insert into results (check_name, ok) values ('an analysis cannot point at another user''s roadmap (foreign key)', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('an analysis cannot point at another user''s roadmap (foreign key)', true);
  end;

  begin
    update public.resume_analyses set career = 'Changed';
    insert into results (check_name, ok) values ('pathwayai_api cannot update analyses', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot update analyses', true);
  end;

  begin
    delete from public.resume_analyses;
    insert into results (check_name, ok) values ('pathwayai_api cannot delete analyses', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('pathwayai_api cannot delete analyses', true);
  end;

  -- Constraints
  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', 'X', '["not", "an", "object"]', 'r1', 'm');
    insert into results (check_name, ok) values ('analysis must be a JSON object', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('analysis must be a JSON object', true);
  end;
  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', 'X', jsonb_build_object('summary', repeat('x', 17000)), 'r1', 'm');
    insert into results (check_name, ok) values ('analysis over 16 KB is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('analysis over 16 KB is rejected', true);
  end;
  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', '', '{}', 'r1', 'm');
    insert into results (check_name, ok) values ('empty career is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('empty career is rejected', true);
  end;
  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', repeat('c', 101), '{}', 'r1', 'm');
    insert into results (check_name, ok) values ('career over 100 characters is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('career over 100 characters is rejected', true);
  end;
  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', 'X', '{}', '', 'm');
    insert into results (check_name, ok) values ('empty prompt_version is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('empty prompt_version is rejected', true);
  end;
  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', 'X', '{}', 'r1', '');
    insert into results (check_name, ok) values ('empty model is rejected', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('empty model is rejected', true);
  end;
  begin
    insert into public.resume_analyses (user_id, career, analysis, prompt_version, model)
      values ('00000000-0000-4000-8000-00000000000a', 'X', null, 'r1', 'm');
    insert into results (check_name, ok) values ('analysis is required', false);
  exception when not_null_violation then
    insert into results (check_name, ok) values ('analysis is required', true);
  end;

  reset role;
end $$;

-- The browser reads and deletes A's own analyses.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select count(*) into n from public.resume_analyses;
  insert into results (check_name, ok, detail) values ('A reads own analyses (history)', n = 2, n::text);
  delete from public.resume_analyses where id = '00000000-0000-4000-8000-0000000000a5';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A deletes own analysis', n = 1, n || ' rows');
  select count(*) into n from public.resume_analyses;
  insert into results (check_name, ok, detail) values ('A''s history shrinks to 1', n = 1, n::text);
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- Cleanup behaviour (as the table owner)
do $$
declare n int; rid uuid; uid uuid;
begin
  delete from public.roadmaps where id = '00000000-0000-4000-8000-0000000000b2';
  select roadmap_id, user_id into rid, uid from public.resume_analyses where id = '00000000-0000-4000-8000-0000000000b5';
  insert into results (check_name, ok, detail) values
    ('deleting a roadmap keeps its analyses (roadmap_id cleared, user kept)',
     rid is null and uid = '00000000-0000-4000-8000-00000000000b', coalesce(rid::text, 'null') || ' / ' || coalesce(uid::text, 'null'));

  delete from auth.users where id = '00000000-0000-4000-8000-00000000000b';
  select count(*) into n from public.resume_analyses where user_id = '00000000-0000-4000-8000-00000000000b';
  insert into results (check_name, ok, detail) values ('deleting a user removes their analyses', n = 0, n::text);
end $$;

select n, check_name, ok, detail from results order by n;

rollback;
