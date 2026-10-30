create type public.user_role as enum ('administrator', 'instructor', 'student');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  email text not null,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- Avoid recursive RLS lookups. The owner reads only the current caller's role.
create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = (select auth.uid());
$$;

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create policy "Users read their own profile; administrators read all profiles"
on public.users for select to authenticated
using (
  id = (select auth.uid())
  or (select public.current_user_role()) = 'administrator'::public.user_role
);

-- No browser client, including an administrator, can write profile roles.
-- Account provisioning happens through the server-side Auth Admin API.
revoke all on public.users from public, anon, authenticated;
grant select on public.users to authenticated;
grant select, insert, update, delete on public.users to service_role;

create function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, first_name, last_name, email, role, created_at)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 100),
    left(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 100),
    coalesce(new.email, ''),
    -- app_metadata is writable only by the trusted Auth Admin API.
    -- User-controlled raw_user_meta_data.role is deliberately ignored.
    case new.raw_app_meta_data ->> 'role'
      when 'administrator' then 'administrator'::public.user_role
      when 'instructor' then 'instructor'::public.user_role
      else 'student'::public.user_role
    end,
    coalesce(new.created_at, now())
  );
  return new;
end;
$$;

revoke all on function public.create_user_profile() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_user_profile();

-- Keep the profile email aligned with verified changes made through Auth.
create function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_user_email() from public, anon, authenticated;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sync_user_email();

-- Existing Auth accounts receive a profile without trusting user metadata roles.
insert into public.users (id, first_name, last_name, email, role, created_at)
select
  id,
  left(trim(coalesce(raw_user_meta_data ->> 'first_name', '')), 100),
  left(trim(coalesce(raw_user_meta_data ->> 'last_name', '')), 100),
  coalesce(email, ''),
  case raw_app_meta_data ->> 'role'
    when 'administrator' then 'administrator'::public.user_role
    when 'instructor' then 'instructor'::public.user_role
    else 'student'::public.user_role
  end,
  coalesce(created_at, now())
from auth.users;
