-- Instructor read contracts. No domain rows or reference values are seeded.
-- Keep history visibility separate from event/attendance write permissions.
begin;
create or replace function public.current_instructor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select i.id from public.instructors i
  join public.users u on u.id = i.user_id
  where u.id = (select auth.uid()) and u.role = 'instructor'
  limit 1;
$$;
-- This table already has policies, but its original migration omitted ENABLE RLS.
alter table public.grade_requirements enable row level security;
-- Do not rely on project-specific Supabase default table privileges for reads.
grant select on public.centres, public.instructors, public.students,
  public.emergency_contacts, public.student_medical_alerts,
  public.grades, public.grade_tracks, public.grade_requirements, public.syllabus_items,
  public.class_types, public.events, public.classes, public.seminars, public.workshops,
  public.gradings, public.grading_target_grades, public.event_students,
  public.grading_applications, public.technique_sign_offs, public.instructor_availability
to authenticated;
drop policy "Participants read event students" on public.event_students;
create policy "Participants read event students" on public.event_students
for select to authenticated using (
  public.is_administrator()
  or public.instructor_teaches_event(event_id)
  or public.instructor_can_see_student(student_id)
  or student_id = public.current_student_id()
);
-- The existing FOR ALL policy permits direct REST updates by event instructors.
-- A row policy cannot protect individual report columns. Enforce ownership even
-- for direct writes, without expanding any existing attendance/roster permission.
create function public.protect_instructor_report_author()
returns trigger language plpgsql security definer set search_path = '' as $$
declare caller uuid;
begin
  if public.current_user_role() is distinct from 'instructor'::public.user_role then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  caller := public.current_instructor_id();
  if tg_op = 'DELETE' then
    if (nullif(btrim(old.report), '') is not null or old.report_author_id is not null)
       and (caller is null or old.report_author_id is distinct from caller) then
      raise exception 'Only the report author may remove this report' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.report is not distinct from old.report
       and new.report_author_id is not distinct from old.report_author_id then
      return new;
    end if;
    if (nullif(btrim(old.report), '') is not null or old.report_author_id is not null)
       and (caller is null or old.report_author_id is distinct from caller) then
      raise exception 'Only the report author may edit this report' using errcode = '42501';
    end if;
  end if;
  if caller is null
     or (nullif(btrim(new.report), '') is not null and new.report_author_id is distinct from caller)
     or (new.report_author_id is not null and new.report_author_id is distinct from caller) then
    raise exception 'Report author must be the current instructor' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_instructor_report_author() from public, anon, authenticated;
create trigger event_students_report_author_guard
before insert or update or delete on public.event_students
for each row execute function public.protect_instructor_report_author();
create function public.require_current_instructor()
returns uuid language plpgsql stable security invoker set search_path = '' as $$
declare caller uuid := public.current_instructor_id();
begin
  if caller is null then
    raise exception 'A linked instructor account is required' using errcode = '42501';
  end if;
  return caller;
end;
$$;
revoke all on function public.require_current_instructor() from public, anon;
grant execute on function public.require_current_instructor() to authenticated;
-- Page totals and facets use the complete authorized directory, not the page.
-- Search uses literal substrings; %, _, commas and PostgREST syntax are not code.
create function public.instructor_student_directory(
  search_text text default '', filter_grade text default null,
  filter_colour text default null, filter_centre uuid default null,
  page_size integer default 50, page_offset integer default 0
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_current_instructor();
  if page_size is null or page_size not between 1 and 100
     or page_offset is null or page_offset < 0
     or search_text is null or char_length(search_text) > 200 then
    raise exception 'Invalid directory pagination or search' using errcode = '22023';
  end if;
  return (
    with scope as materialized (
      select s.*, to_jsonb(g) as grade, to_jsonb(c) as centre
      from public.students s
      left join public.grades g on g.id = s.current_grade_id
      left join public.centres c on c.id = s.home_centre_id
      where public.instructor_can_see_student(s.id)
    ), filtered as (
      select * from scope s
      where (btrim(search_text) = ''
        or strpos(lower(concat_ws(' ', s.first_name, s.last_name)), lower(btrim(search_text))) > 0
        or strpos(lower(s.member_no), lower(btrim(search_text))) > 0)
        and (filter_grade is null or s.current_grade_id = filter_grade)
        and (filter_colour is null or s.grade->>'colour' = filter_colour)
        and (filter_centre is null or s.home_centre_id = filter_centre)
    ), page as (
      select * from filtered order by lower(last_name), lower(first_name), id
      limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(p) order by lower(p.last_name), lower(p.first_name), p.id) from page p), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'scopeTotal', (select count(*) from scope),
      'offset', page_offset, 'limit', page_size,
      'facets', jsonb_build_object(
        'grades', coalesce((select jsonb_agg(g.grade order by (g.grade->>'sort_order')::integer)
          from (select distinct grade from scope where grade is not null) g), '[]'::jsonb),
        'colours', coalesce((select jsonb_agg(c.colour order by c.colour)
          from (select distinct grade->>'colour' as colour from scope where grade->>'colour' is not null) c), '[]'::jsonb),
        'centres', coalesce((select jsonb_agg(c.centre order by c.centre->>'name', c.centre->>'id')
          from (select distinct centre from scope where centre is not null) c), '[]'::jsonb)
      )
    )
  );
end;
$$;
revoke all on function public.instructor_student_directory(text,text,text,uuid,integer,integer) from public, anon;
grant execute on function public.instructor_student_directory(text,text,text,uuid,integer,integer) to authenticated;
-- Complete cross-instructor/dojo history, with deterministic server pagination.
-- Only recorded assessments have assessment_status; null is not "pending".
create function public.instructor_student_history(
  target_student uuid, page_size integer default 50, page_offset integer default 0,
  filter_type public.event_type default null,
  filter_attendance public.attendance_status default null,
  unmarked_only boolean default false, oldest_first boolean default false,
  recorded_assessments_only boolean default false, reports_only boolean default false
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_current_instructor();
  if not public.instructor_can_see_student(target_student) then
    raise exception 'Student is unavailable' using errcode = '42501';
  end if;
  if page_size is null or page_size not between 1 and 100 or page_offset is null or page_offset < 0
     or unmarked_only is null or oldest_first is null or recorded_assessments_only is null or reports_only is null
     or (unmarked_only and filter_attendance is not null) then
    raise exception 'Invalid history pagination or filters' using errcode = '22023';
  end if;
  return (
    with history as (
      select es, e, c, i, author, g
      from public.event_students es
      join public.events e on e.id = es.event_id
      left join public.centres c on c.id = e.centre_id
      left join public.instructors i on i.id = e.instructor_id
      left join public.instructors author on author.id = es.report_author_id
      left join public.grading_applications a on a.grading_event_id = es.event_id and a.student_id = es.student_id
      left join public.grades g on g.id = a.target_grade_id
      where es.student_id = target_student and e.starts_at <= now()
        and (filter_type is null or e.event_type = filter_type)
        and (filter_attendance is null or es.attendance_status = filter_attendance)
        and (not unmarked_only or es.attendance_status is null)
        and (not recorded_assessments_only or (e.event_type = 'grading' and es.assessment_status is not null))
        and (not reports_only or nullif(btrim(es.report), '') is not null)
    ), page as (
      select * from history
      order by case when oldest_first then (e).starts_at end asc,
        case when not oldest_first then (e).starts_at end desc, (e).id
      limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'record', to_jsonb(p.es), 'event', to_jsonb(p.e), 'centre', to_jsonb(p.c),
        'instructor', to_jsonb(p.i), 'reportAuthor', to_jsonb(p.author), 'targetGrade', to_jsonb(p.g)
      ) order by case when oldest_first then (p.e).starts_at end asc,
        case when not oldest_first then (p.e).starts_at end desc, (p.e).id) from page p), '[]'::jsonb),
      'total', (select count(*) from history), 'offset', page_offset, 'limit', page_size
    )
  );
end;
$$;
revoke all on function public.instructor_student_history(uuid,integer,integer,public.event_type,public.attendance_status,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.instructor_student_history(uuid,integer,integer,public.event_type,public.attendance_status,boolean,boolean,boolean,boolean) to authenticated;
-- Aggregates are independent of displayed history pages. Keep individual status
-- counts so an excused/unmarked row is never silently counted as an absence.
create function public.instructor_student_summary(target_student uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_current_instructor();
  if not public.instructor_can_see_student(target_student) then
    raise exception 'Student is unavailable' using errcode = '42501';
  end if;
  return (
    with training as (
      select e.*, es.attendance_status,
        row_number() over (order by e.starts_at desc, e.id desc) as position
      from public.event_students es join public.events e on e.id = es.event_id
      where es.student_id = target_student and e.event_type = 'class'
        and e.status <> 'cancelled' and e.ends_at <= now()
    ), student as (
      select coalesce(s.last_graded_at, s.joined_at) as cycle_start
      from public.students s where s.id = target_student
    )
    select jsonb_build_object(
      'pastSessions', count(*),
      'present', count(*) filter (where t.attendance_status = 'present'),
      'late', count(*) filter (where t.attendance_status = 'late'),
      'absent', count(*) filter (where t.attendance_status = 'absent'),
      'excused', count(*) filter (where t.attendance_status = 'excused'),
      'unmarked', count(*) filter (where t.attendance_status is null),
      'periodStart', min(t.starts_at), 'periodEnd', max(t.starts_at),
      'cycleStart', (select cycle_start from student),
      'cycleAttended', count(*) filter (where t.attendance_status in ('present', 'late')
        and (t.starts_at at time zone 'Asia/Singapore')::date >= (select cycle_start from student)),
      'consecutiveAbsences', coalesce(min(t.position) filter (where t.attendance_status is distinct from 'absent'), count(*) + 1) - 1,
      'lastAttended', (select jsonb_build_object('event', to_jsonb(e), 'centre', to_jsonb(c))
        from training last_session join public.events e on e.id = last_session.id
        left join public.centres c on c.id = e.centre_id
        where last_session.attendance_status in ('present', 'late')
        order by last_session.starts_at desc, last_session.id desc limit 1)
    ) from training t
  );
end;
$$;
revoke all on function public.instructor_student_summary(uuid) from public, anon;
grant execute on function public.instructor_student_summary(uuid) to authenticated;
-- One request for a class report page, avoiding one history request per student.
-- Previous feedback means actual earlier class reports, across dojos/instructors.
create function public.instructor_event_reports(target_event uuid, page_size integer default 50, page_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare session_start timestamptz;
begin
  perform public.require_current_instructor();
  if not public.instructor_teaches_event(target_event) then
    raise exception 'Event is unavailable' using errcode = '42501';
  end if;
  if page_size is null or page_size not between 1 and 100 or page_offset is null or page_offset < 0 then
    raise exception 'Invalid report pagination' using errcode = '22023';
  end if;
  select starts_at into session_start from public.events where id = target_event and event_type = 'class';
  if not found then raise exception 'A class event is required' using errcode = '22023'; end if;
  return (
    with roster as (
      select es, s, g, c from public.event_students es
      join public.students s on s.id = es.student_id
      left join public.grades g on g.id = s.current_grade_id
      left join public.centres c on c.id = s.home_centre_id
      where es.event_id = target_event
    ), page as (
      select * from roster order by lower((s).last_name), lower((s).first_name), (s).id
      limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'record', to_jsonb(p.es), 'student', to_jsonb(p.s) || jsonb_build_object('grade', to_jsonb(p.g), 'centre', to_jsonb(p.c)),
        'previousReports', coalesce((select jsonb_agg(pr.entry order by pr.starts_at desc, pr.id desc) from (
          select previous_event.starts_at, previous_event.id,
            jsonb_build_object('record', to_jsonb(previous_record), 'event', to_jsonb(previous_event),
              'centre', to_jsonb(previous_centre), 'instructor', to_jsonb(previous_instructor),
              'reportAuthor', to_jsonb(previous_author), 'targetGrade', null) as entry
          from public.event_students previous_record
          join public.events previous_event on previous_event.id = previous_record.event_id
          left join public.centres previous_centre on previous_centre.id = previous_event.centre_id
          left join public.instructors previous_instructor on previous_instructor.id = previous_event.instructor_id
          left join public.instructors previous_author on previous_author.id = previous_record.report_author_id
          where previous_record.student_id = (p.s).id and previous_event.event_type = 'class'
            and previous_event.starts_at < session_start and previous_event.starts_at <= now()
            and nullif(btrim(previous_record.report), '') is not null
          order by previous_event.starts_at desc, previous_event.id desc limit 2
        ) pr), '[]'::jsonb)
      ) order by lower((p.s).last_name), lower((p.s).first_name), (p.s).id) from page p), '[]'::jsonb),
      'total', (select count(*) from roster), 'offset', page_offset, 'limit', page_size
    )
  );
end;
$$;
revoke all on function public.instructor_event_reports(uuid,integer,integer) from public, anon;
grant execute on function public.instructor_event_reports(uuid,integer,integer) to authenticated;
commit;
