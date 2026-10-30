-- The Auth Admin API may apply app_metadata after the initial user INSERT.
-- Only trusted app metadata can promote or demote a database profile.
create function public.sync_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set role = case new.raw_app_meta_data ->> 'role'
    when 'administrator' then 'administrator'::public.user_role
    when 'instructor' then 'instructor'::public.user_role
    else 'student'::public.user_role
  end
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_user_role() from public, anon, authenticated;

create trigger on_auth_user_role_updated
after update of raw_app_meta_data on auth.users
for each row
when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
execute function public.sync_user_role();

-- Reconcile accounts provisioned before this update trigger existed.
update public.users as profile
set role = case account.raw_app_meta_data ->> 'role'
  when 'administrator' then 'administrator'::public.user_role
  when 'instructor' then 'instructor'::public.user_role
  else 'student'::public.user_role
end
from auth.users as account
where profile.id = account.id;
