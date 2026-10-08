-- RLS, grant and constraint checks for step_notes (2026-10-07). Run as
-- postgres (e.g. MCP execute_sql) in a transaction that is rolled back.
-- Every row of the final result must have ok = true.

begin;

create temp table results (n serial, check_name text, ok boolean, detail text);
grant insert, select on results to public;
grant usage on sequence results_n_seq to public;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated');
insert into public.quiz_submissions (id, user_id, answers, answers_version) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '{}', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '{}', 2);
insert into public.roadmaps (id, user_id, quiz_submission_id, career) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'A'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 'B');
insert into public.roadmap_steps (id, roadmap_id, user_id, position, title) values
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 0, 'A1'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', 0, 'B1');
insert into public.step_notes (step_id, user_id, note) values
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000b', 'B secret note');

do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select count(*) into n from public.step_notes;
  insert into results (check_name, ok, detail) values ('A sees none of B''s notes', n = 0, n::text);
  insert into public.step_notes (step_id, user_id, note, target_date)
    values ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a', 'my note', '2026-10-20');
  insert into results (check_name, ok) values ('A adds a note and target date to own step', true);
  update public.step_notes set note = 'edited', target_date = null where step_id = '00000000-0000-4000-8000-0000000000a3';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A edits own note', n = 1, n || ' rows');
  begin
    update public.step_notes set updated_at = now() - interval '9 days';
    insert into results (check_name, ok) values ('A cannot forge updated_at', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('A cannot forge updated_at', true);
  end;
  begin
    update public.step_notes set user_id = '00000000-0000-4000-8000-00000000000b';
    insert into results (check_name, ok) values ('A cannot move a note', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('A cannot move a note', true);
  end;
  update public.step_notes set note = 'hacked' where step_id = '00000000-0000-4000-8000-0000000000b3';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A cannot edit B''s note', n = 0, n || ' rows');
  delete from public.step_notes where step_id = '00000000-0000-4000-8000-0000000000b3';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A cannot delete B''s note', n = 0, n || ' rows');
  begin
    insert into public.step_notes (step_id, user_id, note)
      values ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000a', 'x');
    insert into results (check_name, ok) values ('A cannot note B''s step with own id (foreign key)', false);
  exception when foreign_key_violation then
    insert into results (check_name, ok) values ('A cannot note B''s step with own id (foreign key)', true);
  end;
  begin
    insert into public.step_notes (step_id, user_id, note)
      values ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000b', 'x');
    insert into results (check_name, ok) values ('A cannot add a note for B (RLS)', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('A cannot add a note for B (RLS)', true);
  end;
  begin
    update public.step_notes set note = '', target_date = null where step_id = '00000000-0000-4000-8000-0000000000a3';
    insert into results (check_name, ok) values ('empty note rows are refused', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('empty note rows are refused', true);
  end;
  begin
    update public.step_notes set note = repeat('x', 2001) where step_id = '00000000-0000-4000-8000-0000000000a3';
    insert into results (check_name, ok) values ('notes over 2,000 characters are refused', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('notes over 2,000 characters are refused', true);
  end;
  begin
    update public.step_notes set target_date = '1900-01-01' where step_id = '00000000-0000-4000-8000-0000000000a3';
    insert into results (check_name, ok) values ('implausible target dates are refused', false);
  exception when check_violation then
    insert into results (check_name, ok) values ('implausible target dates are refused', true);
  end;
  delete from public.step_notes where step_id = '00000000-0000-4000-8000-0000000000a3';
  get diagnostics n = row_count;
  insert into results (check_name, ok, detail) values ('A deletes own note', n = 1, n || ' rows');
  reset role;
end $$;

do $$
declare n int;
begin
  begin
    set local role anon;
    perform count(*) from public.step_notes;
    reset role;
    insert into results (check_name, ok) values ('anon cannot read notes', false);
  exception when insufficient_privilege then
    reset role;
    insert into results (check_name, ok) values ('anon cannot read notes', true);
  end;
  set local role pathwayai_api;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b"}', true);
  select count(*) into n from public.step_notes;
  insert into results (check_name, ok, detail) values ('the API reads the claimed user''s notes', n = 1, n::text);
  begin
    insert into public.step_notes (step_id, user_id, note)
      values ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000b', 'y');
    insert into results (check_name, ok) values ('the API cannot write notes', false);
  exception when insufficient_privilege then
    insert into results (check_name, ok) values ('the API cannot write notes', true);
  end;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
  select count(*) into n from public.step_notes;
  insert into results (check_name, ok, detail) values ('the API as A sees none of B''s notes', n = 0, n::text);
  reset role;
  delete from public.roadmaps where id = '00000000-0000-4000-8000-0000000000b2';
  select count(*) into n from public.step_notes where user_id = '00000000-0000-4000-8000-00000000000b';
  insert into results (check_name, ok, detail) values ('deleting a roadmap removes its notes', n = 0, n::text);
end $$;

select n, check_name, ok, detail from results order by n;

rollback;
