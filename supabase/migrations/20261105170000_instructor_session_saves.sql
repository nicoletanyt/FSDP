-- Author-owned reports and assigned-event assessments. Each operation updates
-- only its own fields and has an immutable receipt for ambiguous response retries.
begin;

create table public.instructor_session_write_requests (
  request_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('report','assessment')),
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.instructor_session_write_requests enable row level security;
revoke all on public.instructor_session_write_requests from public, anon, authenticated;

create function public.protect_instructor_session_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') and public.current_user_role() = 'instructor'::public.user_role then
    if tg_op = 'INSERT' then
      if new.report is not null or new.report_author_id is not null or new.assessment_status is not null or new.assessment_notes is not null then
        raise exception 'Use the instructor report/assessment save operation' using errcode = '42501';
      end if;
    elsif tg_op = 'DELETE' then
      if old.report is not null or old.report_author_id is not null or old.assessment_status is not null or old.assessment_notes is not null then
        raise exception 'Saved report/assessment records cannot be deleted through the roster' using errcode = '42501';
      end if;
    elsif new.report is distinct from old.report or new.report_author_id is distinct from old.report_author_id
       or new.assessment_status is distinct from old.assessment_status or new.assessment_notes is distinct from old.assessment_notes
       or ((new.event_id is distinct from old.event_id or new.student_id is distinct from old.student_id)
         and (old.report is not null or old.report_author_id is not null or old.assessment_status is not null or old.assessment_notes is not null)) then
      raise exception 'Use the instructor report/assessment save operation' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.protect_instructor_session_write() from public, anon, authenticated;
create trigger event_students_session_write_guard before insert or update or delete on public.event_students
for each row execute function public.protect_instructor_session_write();

create function public.save_instructor_session_record(
  request_id uuid, expected_user uuid, target_event uuid, target_student uuid,
  write_kind text, expected_record jsonb, new_value jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_role public.user_role;
  owner uuid;
  selected public.events%rowtype;
  current_record public.event_students%rowtype;
  stored public.instructor_session_write_requests%rowtype;
  expected jsonb;
  desired jsonb;
  payload jsonb;
  response jsonb;
  report_text text;
  assessment_state public.assessment_status;
  assessment_text text;
begin
  if caller is null or expected_user is distinct from caller then raise exception 'Account changed' using errcode = '42501'; end if;
  select role into caller_role from public.users where id = caller for share;
  if caller_role is distinct from 'instructor'::public.user_role then raise exception 'Instructor access required' using errcode = '42501'; end if;
  select id into owner from public.instructors where user_id = caller for share;
  if owner is null then raise exception 'Linked instructor required' using errcode = '42501'; end if;
  select * into selected from public.events where id = target_event for update;
  if not found or selected.instructor_id is distinct from owner then raise exception 'Event unavailable' using errcode = '42501'; end if;
  select * into current_record from public.event_students where event_id = target_event and student_id = target_student for update;
  if not found then raise exception 'Student is not enrolled in this event' using errcode = '42501'; end if;
  if request_id is null or write_kind is null or write_kind not in ('report','assessment')
     or expected_record is null or jsonb_typeof(expected_record) <> 'object'
     or new_value is null or jsonb_typeof(new_value) <> 'object' then
    raise exception 'Invalid session save' using errcode = '22023';
  end if;
  if write_kind = 'report' then
    if selected.event_type <> 'class' then raise exception 'Reports require a class event' using errcode = '22023'; end if;
    if not (expected_record ?& array['report','reportAuthorId']) or not (new_value ? 'report')
       or jsonb_typeof(expected_record->'report') not in ('string','null')
       or jsonb_typeof(expected_record->'reportAuthorId') not in ('string','null')
       or jsonb_typeof(new_value->'report') not in ('string','null') then raise exception 'Invalid report values' using errcode = '22023'; end if;
    expected := jsonb_build_object('report',expected_record->>'report','reportAuthorId',(expected_record->>'reportAuthorId')::uuid);
    report_text := nullif(btrim(new_value->>'report', E' \t\r\n'), '');
    desired := jsonb_build_object('report',report_text);
  else
    if selected.event_type <> 'grading' then raise exception 'Assessments require a grading event' using errcode = '22023'; end if;
    if not (expected_record ?& array['status','notes']) or not (new_value ?& array['status','notes'])
       or jsonb_typeof(expected_record->'status') not in ('string','null')
       or jsonb_typeof(expected_record->'notes') not in ('string','null')
       or jsonb_typeof(new_value->'status') not in ('string','null')
       or jsonb_typeof(new_value->'notes') not in ('string','null') then raise exception 'Invalid assessment values' using errcode = '22023'; end if;
    expected := jsonb_build_object('status',(expected_record->>'status')::public.assessment_status,'notes',expected_record->>'notes');
    assessment_state := (new_value->>'status')::public.assessment_status;
    assessment_text := nullif(btrim(new_value->>'notes', E' \t\r\n'), '');
    desired := jsonb_build_object('status',assessment_state,'notes',assessment_text);
  end if;
  payload := jsonb_build_object('expected',expected,'value',desired);
  select * into stored from public.instructor_session_write_requests r where r.request_id = save_instructor_session_record.request_id;
  if found then
    if stored.user_id is distinct from caller or stored.event_id is distinct from target_event or stored.student_id is distinct from target_student
       or stored.kind is distinct from write_kind or stored.payload is distinct from payload then
      raise exception 'Request ID was reused' using errcode = 'PRS01';
    end if;
    return stored.response;
  end if;
  if selected.status = 'cancelled' then raise exception 'Cancelled sessions are read-only' using errcode = 'PRS03'; end if;
  if write_kind = 'report' then
    if (nullif(btrim(current_record.report), '') is not null or current_record.report_author_id is not null)
       and current_record.report_author_id is distinct from owner then
      raise exception 'Only the report author may edit this report' using errcode = 'PRS02';
    end if;
    if current_record.report is distinct from expected->>'report'
       or current_record.report_author_id is distinct from (expected->>'reportAuthorId')::uuid then
      raise exception 'Report changed while editing' using errcode = 'PRS01';
    end if;
    update public.event_students set report=report_text, report_author_id=owner
      where event_id=target_event and student_id=target_student;
    desired := jsonb_build_object('report',report_text,'reportAuthorId',owner);
  else
    if current_record.assessment_status is distinct from (expected->>'status')::public.assessment_status
       or current_record.assessment_notes is distinct from expected->>'notes' then
      raise exception 'Assessment changed while editing' using errcode = 'PRS01';
    end if;
    update public.event_students set assessment_status=assessment_state,assessment_notes=assessment_text
      where event_id=target_event and student_id=target_student;
  end if;
  response := jsonb_build_object('requestId',request_id,'eventId',target_event,'studentId',target_student,'kind',write_kind,'value',desired);
  insert into public.instructor_session_write_requests(request_id,user_id,event_id,student_id,kind,payload,response)
    values(request_id,caller,target_event,target_student,write_kind,payload,response);
  return response;
end;
$$;
revoke all on function public.save_instructor_session_record(uuid,uuid,uuid,uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.save_instructor_session_record(uuid,uuid,uuid,uuid,text,jsonb,jsonb) to authenticated;

commit;
