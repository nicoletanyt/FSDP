-- Retire instructor reports while preserving attendance, assessments and sign-offs.
begin;

drop trigger event_students_report_author_guard on public.event_students;
drop function public.protect_instructor_report_author();
drop function public.instructor_event_reports(uuid, integer, integer);

create or replace function public.protect_instructor_session_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') and public.current_user_role() = 'instructor'::public.user_role then
    if tg_op = 'INSERT' then
      if new.assessment_status is not null or new.assessment_notes is not null then
        raise exception 'Use the instructor assessment save operation' using errcode = '42501';
      end if;
    elsif tg_op = 'DELETE' then
      if old.assessment_status is not null or old.assessment_notes is not null then
        raise exception 'Saved assessment records cannot be deleted through the roster' using errcode = '42501';
      end if;
    elsif new.assessment_status is distinct from old.assessment_status or new.assessment_notes is distinct from old.assessment_notes
       or ((new.event_id is distinct from old.event_id or new.student_id is distinct from old.student_id)
         and (old.assessment_status is not null or old.assessment_notes is not null)) then
      raise exception 'Use the instructor assessment save operation' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- The obsolete filter is removed from the signature rather than left as a no-op.
drop function public.instructor_student_history(uuid, integer, integer, public.event_type, public.attendance_status, boolean, boolean, boolean, boolean);
create function public.instructor_student_history(
  target_student uuid, page_size integer default 50, page_offset integer default 0,
  filter_type public.event_type default null,
  filter_attendance public.attendance_status default null,
  unmarked_only boolean default false, oldest_first boolean default false,
  recorded_assessments_only boolean default false
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_instructor_student_read(target_student);
  if page_size is null or page_size not between 1 and 100 or page_offset is null or page_offset < 0
     or unmarked_only is null or oldest_first is null or recorded_assessments_only is null
     or (unmarked_only and filter_attendance is not null) then
    raise exception 'Invalid history pagination or filters' using errcode = '22023';
  end if;
  return (
    with history as (
      select es, e, c, i, g, gr,
        coalesce(e.starts_at, gr.grading_date::timestamp at time zone 'Asia/Singapore') as history_order
      from public.event_students es
      join public.events e on e.id = es.event_id
      left join public.centres c on c.id = e.centre_id
      left join public.instructors i on i.id = e.instructor_id
      left join public.gradings gr on gr.event_id = e.id
      left join public.grading_applications a on a.grading_event_id = es.event_id and a.student_id = es.student_id
      left join public.grades g on g.id = a.target_grade_id
      where es.student_id = target_student
        and (e.starts_at <= now() or (e.event_type = 'grading' and e.starts_at is null
          and gr.grading_date <= (now() at time zone 'Asia/Singapore')::date))
        and (filter_type is null or e.event_type = filter_type)
        and (filter_attendance is null or es.attendance_status = filter_attendance)
        and (not unmarked_only or es.attendance_status is null)
        and (not recorded_assessments_only or (e.event_type = 'grading' and es.assessment_status is not null))
    ), page as (
      select * from history
      order by case when oldest_first then history_order end asc,
        case when not oldest_first then history_order end desc, (e).id
      limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'record', to_jsonb(p.es), 'event', to_jsonb(p.e), 'centre', to_jsonb(p.c),
        'instructor', to_jsonb(p.i), 'targetGrade', to_jsonb(p.g), 'grading', to_jsonb(p.gr)
      ) order by case when oldest_first then p.history_order end asc,
        case when not oldest_first then p.history_order end desc, (p.e).id) from page p), '[]'::jsonb),
      'total', (select count(*) from history), 'offset', page_offset, 'limit', page_size
    )
  );
end;
$$;
revoke all on function public.instructor_student_history(uuid,integer,integer,public.event_type,public.attendance_status,boolean,boolean,boolean) from public, anon;
grant execute on function public.instructor_student_history(uuid,integer,integer,public.event_type,public.attendance_status,boolean,boolean,boolean) to authenticated;

create or replace function public.save_instructor_session_record(
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
  if request_id is null or write_kind is distinct from 'assessment'
     or expected_record is null or jsonb_typeof(expected_record) <> 'object'
     or new_value is null or jsonb_typeof(new_value) <> 'object' then
    raise exception 'Invalid assessment save' using errcode = '22023';
  end if;
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
  if current_record.assessment_status is distinct from (expected->>'status')::public.assessment_status
     or current_record.assessment_notes is distinct from expected->>'notes' then
    raise exception 'Assessment changed while editing' using errcode = 'PRS01';
  end if;
  update public.event_students set assessment_status=assessment_state,assessment_notes=assessment_text
    where event_id=target_event and student_id=target_student;
  response := jsonb_build_object('requestId',request_id,'eventId',target_event,'studentId',target_student,'kind',write_kind,'value',desired);
  insert into public.instructor_session_write_requests(request_id,user_id,event_id,student_id,kind,payload,response)
    values(request_id,caller,target_event,target_student,write_kind,payload,response);
  return response;
end;
$$;

-- Keep historical write receipts intact; report writes can no longer be invoked.
alter table public.event_students drop column report, drop column report_author_id;
notify pgrst, 'reload schema';
commit;
