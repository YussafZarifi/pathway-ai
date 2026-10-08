-- Self-service account deletion (PathwayAI, ADR-022).
-- FastAPI calls this as pathwayai_api after checking a recent password
-- sign-in. It deletes only the user whose claims the API set for the
-- transaction (private.request_user_id(), ADR-019); every PathwayAI table
-- cascades from auth.users, and Supabase removes the user's sessions.
-- Not executable by the browser roles: an access token alone can't delete
-- an account.

create function private.delete_current_user()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.request_user_id();
begin
  if uid is null then
    return false;
  end if;
  delete from auth.users where id = uid;
  return found;
end;
$$;

comment on function private.delete_current_user() is 'Deletes the auth user of the current request claims (ADR-022); executable only by pathwayai_api.';

revoke execute on function private.delete_current_user() from public, anon, authenticated;
grant execute on function private.delete_current_user() to pathwayai_api;
