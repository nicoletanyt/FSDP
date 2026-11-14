-- Canonical storage is students.member_no; students.id stays a UUID.
-- Requires the already-installed membership_application_submit migration.
begin;

do $$
begin
  if to_regprocedure('membership_private.submit_application(jsonb)') is null then
    raise exception 'Please apply membership_application_submit first.';
  end if;
end; $$;

create or replace function membership_private.assign_membership_number()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  candidate text;
  attempt integer;
begin
  if new.member_no is not null and new.member_no <> new.id::text then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asj-member-number-' || extract(year from current_date)::text, 0)
  );
  for attempt in 1..100 loop
    candidate := 'ASJ' || extract(year from current_date)::text
      || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    if not exists (select 1 from public.students where member_no = candidate) then
      new.member_no := candidate;
      return new;
    end if;
  end loop;
  raise exception 'Unable to allocate a unique ASJ number. Please retry or contact an administrator.';
end; $$;

revoke all on function membership_private.assign_membership_number()
  from public, anon, authenticated;
drop trigger if exists assign_asj_membership_number on public.students;
create trigger assign_asj_membership_number
before insert or update of member_no on public.students
for each row execute function membership_private.assign_membership_number();

-- Reuse the full validated application transaction. Also repair only the
-- caller's legacy UUID member number before returning the persisted record.
create or replace function membership_private.submit_formatted_application(application jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  result jsonb;
  saved public.students%rowtype;
begin
  if caller is null then raise exception 'Please sign in again.'; end if;
  result := membership_private.submit_application(application);

  -- The UPDATE intentionally fires the allocator for legacy UUID numbers.
  -- No other account, primary key, paid balance or membership status is changed.
  update public.students set member_no = id::text
  where user_id = caller and member_no = id::text;

  select * into saved from public.students where user_id = caller;
  if not found then raise exception 'Membership record was not saved.'; end if;
  return result || jsonb_build_object(
    'membershipId', saved.member_no,
    'startDate', saved.joined_at
  );
end; $$;

revoke all on function membership_private.submit_formatted_application(jsonb)
  from public, anon, authenticated;
grant execute on function membership_private.submit_formatted_application(jsonb)
  to authenticated;

create or replace function public.submit_my_membership_application(application jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select membership_private.submit_formatted_application(application);
$$;

revoke all on function public.submit_my_membership_application(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_my_membership_application(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
commit;
