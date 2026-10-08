-- Checks for private.delete_current_user() (ADR-022). Run as postgres, e.g.
-- through the Supabase MCP execute_sql tool, in a transaction that is rolled
-- back. Every row of the final result must have ok = true.

begin;

create temp table results (n serial, check_name text, ok boolean, detail text);
grant insert, select on results to public;
grant usage on sequence results_n_seq to public;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated');
insert into public.quiz_submissions (id, user_id, answers, answers_version) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '{"goal":"y"}', 2);
insert into public.roadmaps (id, user_id, quiz_submission_id, career) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Web Developer');
insert into public.coach_threads (id, user_id, title) values
  ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 't');
insert into public.coach_messages (thread_id, user_id, role, content) values
  ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000000a', 'user', 'q');

do $$
declare ok boolean;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
    perform private.delete_current_user();
    reset role;
    insert into results (check_name, ok) values ('the browser cannot call delete_current_user', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('the browser cannot call delete_current_user', true);
  end;

  begin
    set local role anon;
    perform private.delete_current_user();
    reset role;
    insert into results (check_name, ok) values ('anon cannot call delete_current_user', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot call delete_current_user', true);
  end;

  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '', true);
  select private.delete_current_user() into ok;
  reset role;
  insert into results (check_name, ok, detail) values ('without claims nothing is deleted',
    ok = false and (select count(*) from auth.users
                    where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')) = 2, ok::text);

  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select private.delete_current_user() into ok;
  reset role;
  insert into results (check_name, ok, detail) values ('pathwayai_api deletes exactly the claimed user',
    ok and not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000000a'), ok::text);
  insert into results (check_name, ok) values ('other users are untouched',
    exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000000b'));
  insert into results (check_name, ok) values ('all of the user''s rows are gone',
    (select count(*) from public.quiz_submissions where user_id = '00000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.roadmaps where user_id = '00000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.coach_threads where user_id = '00000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.coach_messages where user_id = '00000000-0000-4000-8000-00000000000a')
    + (select count(*) from public.profiles where id = '00000000-0000-4000-8000-00000000000a') = 0);

  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select private.delete_current_user() into ok;
  reset role;
  insert into results (check_name, ok, detail) values ('a second call is a no-op', ok = false, ok::text);

  begin
    set local role pathwayai_api;
    perform count(*) from auth.users;
    reset role;
    insert into results (check_name, ok) values ('pathwayai_api still cannot read auth.users directly', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('pathwayai_api still cannot read auth.users directly', true);
  end;
end $$;

select n, check_name, ok, detail from results order by n;

rollback;
