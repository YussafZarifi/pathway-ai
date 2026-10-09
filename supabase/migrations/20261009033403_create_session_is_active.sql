-- Revocation check for access tokens (ADR-022 amendment, 2026-10-08).
-- Supabase access tokens stay valid until they expire (1 hour), even after
-- "Sign out everywhere" or account deletion removed their session. The API
-- calls this before work that spends AI quota or returns account data, so an
-- ended session is refused at once. It only answers for the session of the
-- user in the current request claims and is executable only by pathwayai_api.
create function private.session_is_active(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = p_session_id
      and s.user_id = private.request_user_id()
      and (s.not_after is null or s.not_after > now())
  );
$$;

comment on function private.session_is_active(uuid) is 'True while the given auth session of the current request user exists and has not passed not_after (ADR-022 amendment); executable only by pathwayai_api.';

revoke execute on function private.session_is_active(uuid) from public, anon, authenticated;
grant execute on function private.session_is_active(uuid) to pathwayai_api;
