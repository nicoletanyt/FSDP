-- Attendance-only writes, with exact retry receipts and transactional full-roster
-- checks. Arrival/report/assessment fields are not rewritten by these operations.
begin;
create table public.instructor_attendance_requests (
  request_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.instructor_attendance_requests enable row level security;
revoke all on public.instructor_attendance_requests from public, anon, authenticated;
-- REST instructors must use the audited RPC for attendance; trusted server and
-- administrator operations retain their existing behavior. SECURITY INVOKER is
-- deliberate: current_user is the definer inside the attendance RPC, while a
-- direct browser REST UPDATE runs as authenticated. No client-settable GUC is
-- used as an authorization bypass.
create function public.protect_instructor_attendance_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and public.current_user_role() = 'instructor'::public.user_role then
    if tg_op = 'INSERT' then
      if new.attendance_status is not null or new.recorded_at is not null or new.checked_in_at is not null then
        raise exception 'Use the instructor attendance save operation' using errcode = '42501';
      end if;
    elsif tg_op = 'DELETE' then
      if old.attendance_status is not null or old.recorded_at is not null or old.checked_in_at is not null then
        raise exception 'Recorded attendance cannot be removed through a roster deletion' using errcode = '42501';
      end if;
    elsif new.attendance_status is distinct from old.attendance_status
       or new.recorded_at is distinct from old.recorded_at
       or new.checked_in_at is distinct from old.checked_in_at
       or ((new.event_id is distinct from old.event_id or new.student_id is distinct from old.student_id)
         and (old.attendance_status is not null or old.recorded_at is not null or old.checked_in_at is not null)) then
      raise exception 'Use the instructor attendance save operation' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_instructor_attendance_write() from public, anon, authenticated;
create trigger event_students_attendance_write_guard before insert or update or delete on public.event_students
for each row execute function public.protect_instructor_attendance_write();
-- Serialize roster membership changes with a bulk save's event lock. A database
-- deadlock/serialization failure rolls the entire operation back and is retriable.
create function public.lock_attendance_roster_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.events where id = new.event_id for update;
  elsif tg_op = 'DELETE' then
    perform 1 from public.events where id = old.event_id for update;
  else
    perform 1 from public.events where id in (old.event_id, new.event_id) order by id for update;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.lock_attendance_roster_event() from public, anon, authenticated;
create trigger event_students_roster_lock before insert or delete or update of event_id, student_id on public.event_students
for each row execute function public.lock_attendance_roster_event();
create function public.save_instructor_attendance(
  request_id uuid, expected_user uuid, target_event uuid, save_scope text,
  new_status public.attendance_status, expected_attendance jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_role public.user_role;
  owner uuid;
  selected public.events%rowtype;
  stored public.instructor_attendance_requests%rowtype;
  expected jsonb;
  payload jsonb;
  response jsonb;
  item jsonb;
  current_record public.event_students%rowtype;
  wanted public.attendance_status;
  protected boolean;
  attendance jsonb := '[]'::jsonb;
begin
  if caller is null or expected_user is distinct from caller then
    raise exception 'The attendance account changed' using errcode = '42501';
  end if;
  select role into caller_role from public.users where id = caller for share;
  if caller_role is distinct from 'instructor'::public.user_role then
    raise exception 'Instructor access is required' using errcode = '42501';
  end if;
  select id into owner from public.instructors where user_id = caller for share;
  if owner is null then raise exception 'A linked instructor is required' using errcode = '42501'; end if;
  select * into selected from public.events where id = target_event for update;
  if not found or selected.instructor_id is distinct from owner then
    raise exception 'Event is unavailable' using errcode = '42501';
  end if;
  if request_id is null or save_scope is null or save_scope not in ('student', 'roster')
     or (new_status is not null and new_status not in ('present', 'absent'))
     or expected_attendance is null or jsonb_typeof(expected_attendance) <> 'array' then
    raise exception 'Invalid attendance request' using errcode = '22023';
  end if;
  if jsonb_array_length(expected_attendance) = 0
     or (save_scope = 'student' and jsonb_array_length(expected_attendance) <> 1) then
    raise exception 'Invalid attendance snapshot' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(expected_attendance) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['studentId','status','recordedAt','checkedInAt'])
       or item->>'studentId' is null then
      raise exception 'Invalid attendance snapshot' using errcode = '22023';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('studentId', x.student_id, 'status', x.status,
    'recordedAt', x.recorded_at, 'checkedInAt', x.checked_in_at) order by x.student_id)
  into expected from (
    select (value->>'studentId')::uuid as student_id, (value->>'status')::public.attendance_status as status,
      (value->>'recordedAt')::timestamptz as recorded_at, (value->>'checkedInAt')::timestamptz as checked_in_at
    from jsonb_array_elements(expected_attendance)
  ) x;
  if (select count(distinct value->>'studentId') from jsonb_array_elements(expected)) <> jsonb_array_length(expected) then
    raise exception 'Duplicate attendance students' using errcode = '22023';
  end if;
  payload := jsonb_build_object('scope', save_scope, 'status', new_status, 'expected', expected);
  select * into stored from public.instructor_attendance_requests r where r.request_id = save_instructor_attendance.request_id;
  if found then
    if stored.user_id is distinct from caller or stored.event_id is distinct from target_event or stored.payload is distinct from payload then
      raise exception 'Attendance request ID was reused' using errcode = 'PAT01';
    end if;
    return stored.response;
  end if;
  if selected.status <> 'scheduled' or selected.starts_at is null or selected.ends_at is null
     or selected.ends_at <= clock_timestamp() then
    raise exception 'Attendance is read-only for this session' using errcode = 'PAT02';
  end if;
  if save_scope = 'roster' and (
    (select count(*) from public.event_students where event_id = target_event) <> jsonb_array_length(expected)
    or exists (select 1 from public.event_students es where es.event_id = target_event
      and not exists (select 1 from jsonb_array_elements(expected) x where (x->>'studentId')::uuid = es.student_id))
  ) then
    raise exception 'The class roster changed' using errcode = 'PAT01';
  end if;
  -- Validate the entire snapshot before changing any row. Lock order is stable.
  for item in select value from jsonb_array_elements(expected) loop
    select * into current_record from public.event_students
      where event_id = target_event and student_id = (item->>'studentId')::uuid for update;
    if not found or current_record.attendance_status is distinct from (item->>'status')::public.attendance_status
       or current_record.recorded_at is distinct from (item->>'recordedAt')::timestamptz
       or current_record.checked_in_at is distinct from (item->>'checkedInAt')::timestamptz then
      raise exception 'Attendance changed while saving' using errcode = 'PAT01';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(expected) loop
    select * into current_record from public.event_students where event_id = target_event and student_id = (item->>'studentId')::uuid;
    protected := current_record.attendance_status in ('late', 'excused')
      or (current_record.attendance_status = 'present' and coalesce(current_record.checked_in_at, current_record.recorded_at) > selected.starts_at + interval '5 minutes');
    if coalesce(protected, false) and save_scope = 'student' then
      raise exception 'This attendance entry is read-only' using errcode = 'PAT03';
    end if;
    wanted := new_status;
    if new_status = 'present' and coalesce(current_record.checked_in_at, current_record.recorded_at) > selected.starts_at + interval '5 minutes' then
      wanted := 'late';
    end if;
    if not coalesce(protected, false) then
      update public.event_students set attendance_status = wanted
        where event_id = target_event and student_id = current_record.student_id;
      current_record.attendance_status := wanted;
    end if;
    attendance := attendance || jsonb_build_array(jsonb_build_object('studentId', current_record.student_id,
      'status', current_record.attendance_status, 'recordedAt', current_record.recorded_at, 'checkedInAt', current_record.checked_in_at));
  end loop;
  if selected.ends_at <= clock_timestamp() then
    raise exception 'Attendance is read-only for this session' using errcode = 'PAT02';
  end if;
  response := jsonb_build_object('requestId', request_id, 'eventId', target_event, 'attendance', attendance);
  insert into public.instructor_attendance_requests(request_id,user_id,event_id,payload,response)
    values (request_id,caller,target_event,payload,response);
  return response;
end;
$$;
revoke all on function public.save_instructor_attendance(uuid,uuid,uuid,text,public.attendance_status,jsonb) from public, anon;
grant execute on function public.save_instructor_attendance(uuid,uuid,uuid,text,public.attendance_status,jsonb) to authenticated;
commit;
