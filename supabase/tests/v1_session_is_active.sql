-- private.session_is_active (ADR-022 amendment): 7 checks. Run in one call
-- (e.g. MCP execute_sql); everything is rolled back. Needs at least one row
-- in auth.sessions (sign in once) and a second user in auth.users.
begin;
select set_config('t.sid', s.id::text, true), set_config('t.uid', s.user_id::text, true),
       set_config('t.other', (select id::text from auth.users where id <> s.user_id limit 1), true)
from auth.sessions s order by s.created_at desc limit 1;
create temp table r (name text, ok boolean) on commit drop;
grant insert, select on r to pathwayai_api;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
set local role pathwayai_api;
insert into r select 'own live session -> true', private.session_is_active(current_setting('t.sid')::uuid);
insert into r select 'random session -> false', not private.session_is_active(gen_random_uuid());
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'), 'role', 'authenticated')::text, true);
insert into r select 'another user''s session id -> false', not private.session_is_active(current_setting('t.sid')::uuid);
select set_config('request.jwt.claims', '{}', true);
insert into r select 'no claims -> false', not private.session_is_active(current_setting('t.sid')::uuid);
reset role;
insert into r select 'anon cannot execute', not has_function_privilege('anon', 'private.session_is_active(uuid)', 'execute');
insert into r select 'authenticated cannot execute', not has_function_privilege('authenticated', 'private.session_is_active(uuid)', 'execute');
insert into r select 'api role can execute', has_function_privilege('pathwayai_api', 'private.session_is_active(uuid)', 'execute');
select count(*) filter (where ok) as passed, count(*) as total, array_agg(name) filter (where not ok) as failed from r;
rollback;
