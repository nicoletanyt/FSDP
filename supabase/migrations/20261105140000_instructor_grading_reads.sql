-- Keep date-only gradings visible without manufacturing event/reporting times.
-- All functions remain read-only and security invoker; existing RLS and report
-- authorship protections continue to apply.
begin;

create function public.instructor_calendar(
  range_from timestamptz, range_to timestamptz,
  page_size integer default 50, page_offset integer default 0
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare caller uuid;
begin
  if public.current_user_role() is distinct from 'instructor'::public.user_role then
    raise exception 'Instructor access is required' using errcode = '42501';
  end if;
  caller := public.current_instructor_id();
  if range_from is null or range_to is null or range_to <= range_from
     or range_to - range_from > interval '62 days'
     or page_size is null or page_size not between 1 and 100 or page_offset is null or page_offset < 0 then
    raise exception 'Invalid calendar range or pagination' using errcode = '22023';
  end if;
  return (
    with scope as (
      select e, c, cl, ct, gr, se, w,
        -- Date boundaries are only sorting/filter coordinates. The returned
        -- event timestamps and reporting_time remain exactly as stored.
        coalesce(e.starts_at, gr.grading_date::timestamp at time zone 'Asia/Singapore') as calendar_order
      from public.events e
      left join public.centres c on c.id = e.centre_id
      left join public.classes cl on cl.event_id = e.id
      left join public.class_types ct on ct.id = cl.class_type_id
      left join public.gradings gr on gr.event_id = e.id
      left join public.seminars se on se.event_id = e.id
      left join public.workshops w on w.event_id = e.id
      where e.instructor_id = caller and (
        (e.starts_at < range_to and e.ends_at > range_from)
        or (e.event_type = 'grading' and e.starts_at is null
          and gr.grading_date::timestamp at time zone 'Asia/Singapore' < range_to
          and (gr.grading_date + 1)::timestamp at time zone 'Asia/Singapore' > range_from)
      )
    ), page as (
      select * from scope order by calendar_order, (e).id limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(p.e) || jsonb_build_object(
        'centre', to_jsonb(p.c),
        'class', case when (p.cl).event_id is null then null else to_jsonb(p.cl) || jsonb_build_object('class_type', to_jsonb(p.ct)) end,
        'grading', case when (p.gr).event_id is null then null else to_jsonb(p.gr) || jsonb_build_object('target_grades',
          coalesce((select jsonb_agg(jsonb_build_object('grade', to_jsonb(g)) order by g.sort_order, g.id)
            from public.grading_target_grades t join public.grades g on g.id = t.grade_id
            where t.grading_event_id = (p.e).id), '[]'::jsonb)) end,
        'seminar', to_jsonb(p.se), 'workshop', to_jsonb(p.w),
        'participants', jsonb_build_array(jsonb_build_object('count',
          (select count(*) from public.event_students es where es.event_id = (p.e).id)))
      ) order by p.calendar_order, (p.e).id) from page p), '[]'::jsonb),
      'total', (select count(*) from scope), 'offset', page_offset, 'limit', page_size
    )
  );
end;
$$;
revoke all on function public.instructor_calendar(timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.instructor_calendar(timestamptz, timestamptz, integer, integer) to authenticated;

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
      select es, e, c, i, author, g, gr,
        coalesce(e.starts_at, gr.grading_date::timestamp at time zone 'Asia/Singapore') as history_order
      from public.event_students es
      join public.events e on e.id = es.event_id
      left join public.centres c on c.id = e.centre_id
      left join public.instructors i on i.id = e.instructor_id
      left join public.instructors author on author.id = es.report_author_id
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
        and (not reports_only or nullif(btrim(es.report), '') is not null)
    ), page as (
      select * from history
      order by case when oldest_first then history_order end asc,
        case when not oldest_first then history_order end desc, (e).id
      limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'record', to_jsonb(p.es), 'event', to_jsonb(p.e), 'centre', to_jsonb(p.c),
        'instructor', to_jsonb(p.i), 'reportAuthor', to_jsonb(p.author), 'targetGrade', to_jsonb(p.g),
        'grading', to_jsonb(p.gr)
      ) order by case when oldest_first then p.history_order end asc,
        case when not oldest_first then p.history_order end desc, (p.e).id) from page p), '[]'::jsonb),
      'total', (select count(*) from history), 'offset', page_offset, 'limit', page_size
    )
  );
end;
$$;

commit;
