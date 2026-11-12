begin;

-- Each target grade is its own grading session with its own time slot.
alter table public.grading_target_grades
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add constraint grading_target_grades_time_check check (
    (starts_at is null and ends_at is null) or (starts_at is not null and ends_at is not null and ends_at > starts_at));
comment on column public.grading_target_grades.starts_at is
  'Start of this grade''s grading session within the grading event. NULL means not scheduled.';

-- Calendar: each target grade carries its time and candidate count, and each
-- item says whether the caller sits on that grading's panel. Panel members see
-- one calendar block per timed grade session; others keep one grading block.
create or replace function public.instructor_calendar(range_from timestamp with time zone, range_to timestamp with time zone, page_size integer default 50, page_offset integer default 0)
returns jsonb language plpgsql stable set search_path to '' as $function$
declare caller uuid;
begin
  if public.current_user_role() is distinct from 'instructor'::public.user_role then
    raise exception 'Instructor access is required' using errcode = '42501';
  end if;
  caller := public.current_instructor_id();
  if range_from is null or range_to is null or range_to <= range_from or range_to - range_from > interval '62 days'
    or page_size is null or page_size not between 1 and 100 or page_offset is null or page_offset < 0 then
    raise exception 'Invalid calendar range or pagination' using errcode = '22023';
  end if;
  return (
    with scope as (
      select e,c,cl,ct,gr,se,w,
        coalesce(e.starts_at,gr.grading_date::timestamp at time zone 'Asia/Singapore') as calendar_order
      from public.events e
      left join public.centres c on c.id=e.centre_id
      left join public.classes cl on cl.event_id=e.id
      left join public.class_types ct on ct.id=cl.class_type_id
      left join public.gradings gr on gr.event_id=e.id
      left join public.seminars se on se.event_id=e.id
      left join public.workshops w on w.event_id=e.id
      where caller is not null and (e.instructor_id=caller or e.event_type='grading') and (
        (e.starts_at<range_to and e.ends_at>range_from)
        or (e.event_type='grading' and e.starts_at is null
          and gr.grading_date::timestamp at time zone 'Asia/Singapore'<range_to
          and (gr.grading_date+1)::timestamp at time zone 'Asia/Singapore'>range_from)
      )
    ), page as (select * from scope order by calendar_order,(e).id limit page_size offset page_offset)
    select jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(p.e)||jsonb_build_object(
        'centre',to_jsonb(p.c),
        'class',case when (p.cl).event_id is null then null else to_jsonb(p.cl)||jsonb_build_object('class_type',to_jsonb(p.ct)) end,
        'grading',case when (p.gr).event_id is null then null else to_jsonb(p.gr)||jsonb_build_object('target_grades',
          coalesce((select jsonb_agg(jsonb_build_object('grade',to_jsonb(g),'starts_at',t.starts_at,'ends_at',t.ends_at,
              'candidates',(select count(*) from public.grading_applications ga
                where ga.grading_event_id=t.grading_event_id and ga.target_grade_id=t.grade_id and ga.status<>'withdrawn'))
              order by g.sort_order,g.id)
            from public.grading_target_grades t join public.grades g on g.id=t.grade_id where t.grading_event_id=(p.e).id),'[]'::jsonb)) end,
        'on_panel',(p.gr).event_id is not null and public.is_on_grading_panel((p.e).id),
        'seminar',to_jsonb(p.se),'workshop',to_jsonb(p.w),
        'participants',jsonb_build_array(jsonb_build_object('count',(select count(*) from public.event_students es where es.event_id=(p.e).id)))
      ) order by p.calendar_order,(p.e).id) from page p),'[]'::jsonb),
      'total',(select count(*) from scope),'offset',page_offset,'limit',page_size
    )
  );
end;
$function$;

-- Grading day: each grade session carries its time, and sessions are listed in time order.
create or replace function public.examiner_grading_day(target_event uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := (select public.current_instructor_id());
  result jsonb;
begin
  if not exists (select 1 from public.gradings where event_id = target_event) then
    raise exception 'Grading session not found' using errcode = '22023';
  end if;
  if not ((select public.is_administrator()) or public.is_on_grading_panel(target_event)) then
    raise exception 'Only examiners on this grading''s panel can grade it' using errcode = 'PGP01';
  end if;
  select jsonb_build_object(
    'event_id', e.id, 'name', e.name, 'status', e.status, 'track', g.track,
    'grading_date', coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date),
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'reporting_time', g.reporting_time,
    'centre', jsonb_build_object('name', c.name, 'address', c.address),
    'is_chief', coalesce((select m.is_chief from public.grading_panel_members m
      where m.grading_event_id = e.id and m.instructor_id = me), false),
    'panel', (select coalesce(jsonb_agg(jsonb_build_object(
        'instructor_id', p.instructor_id, 'name', trim(i.first_name || ' ' || i.last_name), 'is_chief', p.is_chief)
        order by p.is_chief desc, p.added_at, p.instructor_id), '[]'::jsonb)
      from public.grading_panel_members p join public.instructors i on i.id = p.instructor_id
      where p.grading_event_id = e.id),
    'grades', (select coalesce(jsonb_agg(jsonb_build_object(
        'grade', jsonb_build_object('id', gr.id, 'label', gr.label, 'colour', gr.colour,
          'is_ranked', gr.is_ranked, 'sort_order', gr.sort_order),
        'starts_at', t.starts_at, 'ends_at', t.ends_at,
        'candidates', (select coalesce(jsonb_agg(jsonb_build_object(
            'student_id', s.id, 'name', coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.email),
            'member_no', s.member_no, 'candidate_number', es.candidate_number,
            'current_grade', (select cg.label from public.grades cg where cg.id = s.current_grade_id))
            order by es.candidate_number nulls last, s.last_name, s.first_name, s.id), '[]'::jsonb)
          from public.grading_applications ga
          join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id
          join public.students s on s.id = ga.student_id
          where ga.grading_event_id = e.id and ga.target_grade_id = gr.id and ga.status <> 'withdrawn'),
        'my_batch', (select jsonb_build_object('status', b.status, 'version', b.version,
            'updated_at', b.updated_at, 'submitted_at', b.submitted_at)
          from public.grading_batches b
          where b.event_id = e.id and b.instructor_id = me and b.target_grade_id = gr.id)
      ) order by t.starts_at nulls last, gr.sort_order, gr.id), '[]'::jsonb)
      from public.grading_target_grades t join public.grades gr on gr.id = t.grade_id
      where t.grading_event_id = e.id)
  ) into result
  from public.gradings g join public.events e on e.id = g.event_id join public.centres c on c.id = e.centre_id
  where g.event_id = target_event;
  return result;
end;
$$;
revoke all on function public.examiner_grading_day(uuid) from public, anon;

commit;
