begin;

create function public.current_part_time_instructor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select i.id from public.instructors i
  join public.users u on u.id = i.user_id
  where u.id = (select auth.uid()) and u.role = 'instructor'
    and i.employment_type = 'part_time';
$$;
revoke all on function public.current_part_time_instructor_id() from public, anon;
grant execute on function public.current_part_time_instructor_id() to authenticated;

-- RLS does not protect TRUNCATE; do not inherit broad Supabase table grants.
revoke all on public.instructor_availability from public, anon, authenticated;
grant select, insert, update, delete on public.instructor_availability to authenticated;
grant all on public.instructor_availability to service_role;

-- Permissive policies combine with OR. Replace the broad authenticated SELECT
-- and owner-management policies rather than adding a restriction beside them.
drop policy "Authenticated read availability" on public.instructor_availability;
drop policy "Instructors manage their availability" on public.instructor_availability;
create policy "Part-time instructors read their availability"
on public.instructor_availability for select to authenticated
using (instructor_id = (select public.current_part_time_instructor_id()));
create policy "Part-time instructors add their availability"
on public.instructor_availability for insert to authenticated
with check (instructor_id = (select public.current_part_time_instructor_id()));
create policy "Admins manage availability"
on public.instructor_availability for all to authenticated
using ((select public.is_administrator())) with check ((select public.is_administrator()));

-- Also guard trusted RPC writes, which run as the function owner and bypass RLS.
-- The owner lock serializes changes with an administrator changing employment.
create function public.require_part_time_availability_writer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  target_id uuid;
begin
  if public.current_user_role() = 'instructor'::public.user_role then
    select id into owner_id from public.instructors
    where user_id = (select auth.uid()) and employment_type = 'part_time' for update;
    if tg_op = 'DELETE' then target_id := old.instructor_id;
    else target_id := new.instructor_id; end if;
    if owner_id is null or owner_id is distinct from target_id
      or (tg_op = 'UPDATE' and old.instructor_id is distinct from owner_id) then
      raise exception 'Availability is only available to part-time instructors' using errcode = 'PAV06';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.require_part_time_availability_writer() from public, anon, authenticated;
create trigger instructor_availability_part_time_guard
before insert or update or delete on public.instructor_availability
for each row execute function public.require_part_time_availability_writer();

create or replace function public.create_instructor_availability(
  expected_user uuid, slot_date date, slot_start time, slot_end time
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  profile public.users%rowtype;
  owner_id uuid;
  saved public.instructor_availability%rowtype;
begin
  if (select auth.uid()) is null or expected_user is distinct from (select auth.uid()) then
    raise exception 'The signed-in account changed' using errcode = '42501';
  end if;
  select * into profile from public.users
  where id = (select auth.uid()) and role = 'instructor' for update;
  if not found then raise exception 'Instructor access is required' using errcode = '42501'; end if;

  select id into owner_id from public.instructors
  where user_id = profile.id and employment_type = 'part_time' for update;
  if owner_id is null then
    raise exception 'Availability is only available to part-time instructors' using errcode = 'PAV06';
  end if;
  -- Check eligibility before exact-slot retries, not only before new inserts.
  select * into saved from public.instructor_availability
  where instructor_id = owner_id and date = slot_date and start_time = slot_start and end_time = slot_end;
  if found then return to_jsonb(saved); end if;
  insert into public.instructor_availability(instructor_id, date, start_time, end_time)
  values (owner_id, slot_date, slot_start, slot_end) returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_instructor_availability(uuid,date,time,time) from public, anon;
grant execute on function public.create_instructor_availability(uuid,date,time,time) to authenticated;

-- Some installations have the optional edit/delete receipt migration already.
-- Preserve its rows and support fresh local databases without that migration.
create table if not exists public.instructor_availability_requests (
  request_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  slot_id uuid not null,
  kind text not null check (kind in ('update','delete')),
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.instructor_availability_requests enable row level security;
revoke all on public.instructor_availability_requests from public, anon, authenticated;

-- Keep the existing compare-and-set and receipt behavior, but enforce current
-- employment before returning any slot data, including a stored retry response.
create or replace function public.save_instructor_availability(
  request_id uuid, expected_user uuid, target_slot uuid, write_kind text,
  expected_record jsonb, new_value jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_role public.user_role;
  owner uuid;
  selected public.instructor_availability%rowtype;
  stored public.instructor_availability_requests%rowtype;
  expected jsonb;
  desired jsonb;
  payload jsonb;
  response jsonb;
begin
  if caller is null or expected_user is distinct from caller then raise exception 'Account changed' using errcode = '42501'; end if;
  select role into caller_role from public.users where id = caller for share;
  if caller_role is distinct from 'instructor'::public.user_role then raise exception 'Instructor access required' using errcode = '42501'; end if;
  select id into owner from public.instructors
    where user_id = caller and employment_type = 'part_time' for update;
  if owner is null then
    raise exception 'Availability is only available to part-time instructors' using errcode = 'PAV06';
  end if;
  if request_id is null or target_slot is null or write_kind is null or write_kind not in ('update','delete')
     or expected_record is null or jsonb_typeof(expected_record) <> 'object'
     or not (expected_record ?& array['date','startTime','endTime'])
     or jsonb_typeof(expected_record->'date') <> 'string'
     or jsonb_typeof(expected_record->'startTime') <> 'string'
     or jsonb_typeof(expected_record->'endTime') <> 'string' then
    raise exception 'Invalid availability snapshot' using errcode = '22023';
  end if;
  expected := jsonb_build_object('date',(expected_record->>'date')::date,
    'startTime',(expected_record->>'startTime')::time,'endTime',(expected_record->>'endTime')::time);
  if write_kind = 'update' then
    if new_value is null or jsonb_typeof(new_value) <> 'object'
       or not (new_value ?& array['date','startTime','endTime'])
       or jsonb_typeof(new_value->'date') <> 'string'
       or jsonb_typeof(new_value->'startTime') <> 'string'
       or jsonb_typeof(new_value->'endTime') <> 'string' then
      raise exception 'Invalid availability value' using errcode = '22023';
    end if;
    desired := jsonb_build_object('date',(new_value->>'date')::date,
      'startTime',(new_value->>'startTime')::time,'endTime',(new_value->>'endTime')::time);
  else
    if new_value is not null and new_value <> 'null'::jsonb then raise exception 'Deletion has no new value' using errcode = '22023'; end if;
    desired := 'null'::jsonb;
  end if;
  payload := jsonb_build_object('expected',expected,'value',desired);
  select * into selected from public.instructor_availability where id = target_slot for update;
  if found and selected.instructor_id is distinct from owner then raise exception 'Slot unavailable' using errcode = '42501'; end if;
  select * into stored from public.instructor_availability_requests r where r.request_id = save_instructor_availability.request_id;
  if found then
    if stored.user_id is distinct from caller or stored.instructor_id is distinct from owner
       or stored.slot_id is distinct from target_slot or stored.kind is distinct from write_kind or stored.payload is distinct from payload then
      raise exception 'Request ID was reused' using errcode = 'PAV05';
    end if;
    return stored.response;
  end if;
  if selected.id is null then raise exception 'Availability was removed' using errcode = 'PAV05'; end if;
  if selected.date is distinct from (expected->>'date')::date
     or selected.start_time is distinct from (expected->>'startTime')::time
     or selected.end_time is distinct from (expected->>'endTime')::time then
    raise exception 'Availability changed while editing' using errcode = 'PAV05';
  end if;
  if write_kind = 'delete' then
    delete from public.instructor_availability where id = target_slot;
    response := jsonb_build_object('requestId',request_id,'slotId',target_slot,'kind',write_kind,'slot',null);
  else
    update public.instructor_availability set date=(desired->>'date')::date,
      start_time=(desired->>'startTime')::time,end_time=(desired->>'endTime')::time
      where id=target_slot returning * into selected;
    if ((selected.date + selected.start_time) at time zone 'Asia/Singapore') <= clock_timestamp() then
      raise exception 'Availability start has passed' using errcode = 'PAV03';
    end if;
    response := jsonb_build_object('requestId',request_id,'slotId',target_slot,'kind',write_kind,'slot',to_jsonb(selected));
  end if;
  insert into public.instructor_availability_requests(request_id,user_id,instructor_id,slot_id,kind,payload,response)
    values(request_id,caller,owner,target_slot,write_kind,payload,response);
  return response;
end;
$$;
revoke all on function public.save_instructor_availability(uuid,uuid,uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.save_instructor_availability(uuid,uuid,uuid,text,jsonb,jsonb) to authenticated;

commit;
