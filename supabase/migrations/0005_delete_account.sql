-- Apply after 0004_swing_clips.sql. Safe to re-run.
begin;

/*
  Leaving.

  Deleting the auth user cascades through public.users and every table that
  references it, which is the only way to be sure nothing is left behind. That
  delete needs rights the signed-in role does not have, so it happens inside a
  definer function that can only ever delete the caller: auth.uid() is read
  from the request's own JWT and is not a parameter, so there is nothing for a
  caller to point at somebody else's row.

  Stored videos are not database rows and do not cascade. The application
  removes the caller's folder from the swing-videos bucket before calling this.
*/
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

commit;
