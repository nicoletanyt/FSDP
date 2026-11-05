-- Instructor student reads are role-based, not limited by teaching assignments.
-- Leave instructor_can_see_student and all write policies unchanged: that helper
-- is also used by technique-sign-off mutation policies.
begin;

create function public.require_instructor_account()
returns uuid language plpgsql stable security invoker set search_path = '' as $$
begin
  if (select public.current_user_role()) is distinct from 'instructor'::public.user_role then
    raise exception 'Instructor access is required' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function public.require_instructor_account() from public, anon;
grant execute on function public.require_instructor_account() to authenticated;

create function public.require_instructor_student_read(target_student uuid)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_instructor_account();
  if not exists (select 1 from public.students where id = target_student) then
    raise exception 'Student is unavailable' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_instructor_student_read(uuid) from public, anon;
grant execute on function public.require_instructor_student_read(uuid) to authenticated;

-- Separate permissive SELECT policies expand reads only, including instructors
-- without a domain row. Student self-access and administrator access remain as-is.
create policy "Instructors read all students" on public.students
for select to authenticated using ((select public.current_user_role()) = 'instructor'::public.user_role);
create policy "Instructors read all student emergency contacts" on public.emergency_contacts
for select to authenticated using ((select public.current_user_role()) = 'instructor'::public.user_role);
create policy "Instructors read all student medical alerts" on public.student_medical_alerts
for select to authenticated using ((select public.current_user_role()) = 'instructor'::public.user_role);
create policy "Instructors read all student history" on public.event_students
for select to authenticated using ((select public.current_user_role()) = 'instructor'::public.user_role);
create policy "Instructors read all student applications" on public.grading_applications
for select to authenticated using ((select public.current_user_role()) = 'instructor'::public.user_role);
create policy "Instructors read all student sign offs" on public.technique_sign_offs
for select to authenticated using ((select public.current_user_role()) = 'instructor'::public.user_role);

create or replace function public.instructor_student_directory(
  search_text text default '', filter_grade text default null,
  filter_colour text default null, filter_centre uuid default null,
  page_size integer default 50, page_offset integer default 0
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_instructor_account();
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

create or replace function public.instructor_student_history(
  target_student uuid, page_size integer default 50, page_offset integer default 0,
  filter_type public.event_type default null,
  filter_attendance public.attendance_status default null,
  unmarked_only boolean default false, oldest_first boolean default false,
  recorded_assessments_only boolean default false, reports_only boolean default false
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_instructor_student_read(target_student);
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

create or replace function public.instructor_student_summary(target_student uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.require_instructor_student_read(target_student);
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

-- Replacing the existing RPCs preserves their signatures and ACLs; keep the
-- execute grants explicit for installations where ACLs were adjusted manually.
revoke all on function public.instructor_student_directory(text,text,text,uuid,integer,integer) from public, anon;
revoke all on function public.instructor_student_history(uuid,integer,integer,public.event_type,public.attendance_status,boolean,boolean,boolean,boolean) from public, anon;
revoke all on function public.instructor_student_summary(uuid) from public, anon;
grant execute on function public.instructor_student_directory(text,text,text,uuid,integer,integer) to authenticated;
grant execute on function public.instructor_student_history(uuid,integer,integer,public.event_type,public.attendance_status,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.instructor_student_summary(uuid) to authenticated;

commit;
