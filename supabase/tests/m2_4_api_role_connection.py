"""
M2-4 check: connect through the Supabase transaction pooler as pathwayai_api
(DATABASE_URL from backend/.env) and verify that RLS holds for the API role
(ADR-019). Never prints DATABASE_URL or the password.

Needs psycopg 3 and python-dotenv (psycopg joins requirements.txt in M2-5).
Run from the repo root:  python supabase/tests/m2_4_api_role_connection.py

It expects two fixture users, created first as postgres (e.g. MCP
execute_sql) and deleted afterwards (the delete cascades to their rows):

  insert into auth.users (id, email, aud, role) values
    ('00000000-0000-4000-8000-00000000000c', 'm24-c@example.test', 'authenticated', 'authenticated'),
    ('00000000-0000-4000-8000-00000000000d', 'm24-d@example.test', 'authenticated', 'authenticated');
  insert into public.quiz_submissions (id, user_id, answers, answers_version) values
    ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000c', '{"goal":"c"}', 2),
    ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000d', '{"goal":"d"}', 2);
  insert into public.roadmaps (id, user_id, quiz_submission_id, career) values
    ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-0000000000c1', 'C career'),
    ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-0000000000d1', 'D career');
  insert into public.roadmap_steps (id, roadmap_id, user_id, position, title) values
    ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000c', 0, 'C step'),
    ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000d', 0, 'D step');
  insert into public.step_progress (step_id, user_id) values
    ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000000c'),
    ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-00000000000d');

  -- afterwards:
  delete from auth.users where id in ('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000d');
"""

import json
from pathlib import Path

import psycopg
from dotenv import dotenv_values

URL = dotenv_values(Path(__file__).resolve().parents[2] / "backend" / ".env").get("DATABASE_URL")
C = "00000000-0000-4000-8000-00000000000c"
D = "00000000-0000-4000-8000-00000000000d"
TABLES = ["quiz_submissions", "roadmaps", "roadmap_steps", "step_progress"]
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))


def counts(cur):
    out = {}
    for t in TABLES:
        cur.execute(f"select count(*) from public.{t}")
        out[t] = cur.fetchone()[0]
    return out


def set_claims(cur, user_id):
    # Transaction-local, exactly as FastAPI will do it (ADR-019).
    cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": user_id}),))


def expect_error(conn, name, sql, params=None, claims=None):
    with conn.transaction():
        try:
            with conn.transaction():  # savepoint
                with conn.cursor() as cur:
                    if claims:
                        set_claims(cur, claims)
                    cur.execute(sql, params)
            check(name, False, "no error")
        except psycopg.Error as e:
            check(name, True, type(e).__name__)


assert URL, "DATABASE_URL missing in backend/.env"
# prepare_threshold=None: the transaction pooler does not support prepared statements.
with psycopg.connect(URL, prepare_threshold=None, connect_timeout=15) as conn:
    with conn.cursor() as cur:
        cur.execute("select current_user, session_user")
        cu, su = cur.fetchone()
        check("connected through the pooler as pathwayai_api", cu == "pathwayai_api" and su == "pathwayai_api", f"{cu}/{su}")
        cur.execute("select rolsuper, rolbypassrls, rolinherit, rolcanlogin from pg_roles where rolname = current_user")
        sup, bypass, inherit, login = cur.fetchone()
        check("role is not superuser, cannot bypass RLS, inherits nothing", not sup and not bypass and not inherit and login,
              f"super={sup} bypassrls={bypass} inherit={inherit} login={login}")
        cur.execute("select count(*) from pg_auth_members where member = 'pathwayai_api'::regrole")
        check("role is a member of no other role", cur.fetchone()[0] == 0)
    conn.commit()

    # No claims: nothing visible although both fixture users have rows.
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("select set_config('request.jwt.claims', '', true)")
        c = counts(cur)
        check("no claims: no rows in any table", sum(c.values()) == 0, str(c))

    # Claims for C: exactly C's rows.
    with conn.transaction(), conn.cursor() as cur:
        set_claims(cur, C)
        c = counts(cur)
        check("claims for C: exactly C's 4 rows", all(v == 1 for v in c.values()), str(c))
        cur.execute("select count(*) from public.roadmaps where user_id <> %s", (C,))
        check("claims for C: none of D's rows", cur.fetchone()[0] == 0)

    # Claims must not outlive their transaction on the pooled connection.
    with conn.transaction(), conn.cursor() as cur:
        c = counts(cur)
        check("next transaction without set_config sees no rows", sum(c.values()) == 0, str(c))

    # Writes: own rows allowed (rolled back), other user's rows refused.
    with conn.transaction(force_rollback=True), conn.cursor() as cur:
        set_claims(cur, C)
        cur.execute("insert into public.quiz_submissions (user_id, answers, answers_version) values (%s, '{}', 2) returning id", (C,))
        check("claims for C: can insert C's quiz submission", cur.fetchone() is not None)
    expect_error(conn, "claims for C: cannot insert a row for D (RLS)",
                 "insert into public.quiz_submissions (user_id, answers, answers_version) values (%s, '{}', 2)", (D,), claims=C)
    expect_error(conn, "claims for C: cannot change a roadmap's career (grant)",
                 "update public.roadmaps set career = 'x' where user_id = %s", (C,), claims=C)
    expect_error(conn, "cannot delete roadmaps (grant)", "delete from public.roadmaps", claims=C)

    # Bypass attempts.
    expect_error(conn, "row_security = off is refused (cannot bypass RLS)",
                 "set local row_security = off; select count(*) from public.roadmaps")
    expect_error(conn, "cannot disable RLS on a table (not the owner)",
                 "alter table public.roadmaps disable row level security")
    expect_error(conn, "cannot switch to role postgres", "set local role postgres")
    expect_error(conn, "cannot switch to role authenticated", "set local role authenticated")
    expect_error(conn, "cannot switch to role service_role", "set local role service_role")
    expect_error(conn, "cannot read profiles", "select count(*) from public.profiles")
    expect_error(conn, "cannot read auth.users", "select count(*) from auth.users")

passed = sum(ok for _, ok, _ in results)
for name, ok, detail in results:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))
print(f"\n{passed}/{len(results)} passed")
