-- Run after 20261114142809_membership_application_submit.sql.
-- UUID primary keys remain unchanged; ASJ numbers are display/member numbers.
begin;

do $$
begin
  if to_regprocedure('membership_private.submit_application(jsonb)') is null then
    raise exception 'Apply membership_application_submit before this migration.';
  end if;
end; $$;

create or replace function membership_private.assign_membership_number()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  candidate text;
  attempt integer;
begin
  -- Preserve deliberately assigned IDs. Replace only missing/UUID defaults.
  if new.member_no is not null and new.member_no <> new.id::text then
    return new;
  end if;

  -- Serialize allocations for this year so simultaneous applicants cannot
  -- both claim the same random number. member_no already has a UNIQUE constraint.
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

  raise exception 'Unable to allocate an ASJ membership number. Please retry or contact an administrator.';
end; $$;

revoke all on function membership_private.assign_membership_number()
  from public, anon, authenticated;

drop trigger if exists assign_asj_membership_number on public.students;
create trigger assign_asj_membership_number
before insert or update of member_no on public.students
for each row execute function membership_private.assign_membership_number();

-- Complete public RPC definition: the existing private transaction still
-- handles ownership, application fields, contacts, credits and return fields.
-- Its INSERT into students now receives the ASJ number through the trigger.
create or replace function public.submit_my_membership_application(application jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select membership_private.submit_application(application);
$$;

revoke all on function public.submit_my_membership_application(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_my_membership_application(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
commit;
