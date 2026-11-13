-- Candidates are counted the same way everywhere: active (non-withdrawn)
-- applications, whether or not they have been sorted onto the roster yet.
create or replace function public.my_grading_panels()
returns jsonb language sql stable set search_path to '' as $function$
  with mine as (
    select m.grading_event_id, m.is_chief from public.grading_panel_members m
    where m.instructor_id = (select public.current_instructor_id())
  ), sessions as (
    select e.id, e.name, e.status, e.starts_at, e.ends_at, g.track, g.reporting_time, mine.is_chief,
      coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date) as grading_date,
      c.name as centre_name, c.address as centre_address
    from mine
    join public.gradings g on g.event_id = mine.grading_event_id
    join public.events e on e.id = g.event_id
    join public.centres c on c.id = e.centre_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', s.id, 'name', s.name, 'status', s.status, 'track', s.track,
    'grading_date', s.grading_date, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'reporting_time', s.reporting_time, 'is_chief', s.is_chief,
    'centre', jsonb_build_object('name', s.centre_name, 'address', s.centre_address),
    'candidates', (select count(*) from public.grading_applications ga
      where ga.grading_event_id = s.id and ga.status <> 'withdrawn'),
    'panel', (select coalesce(jsonb_agg(jsonb_build_object(
        'instructor_id', p.instructor_id, 'name', trim(i.first_name || ' ' || i.last_name), 'is_chief', p.is_chief)
        order by p.is_chief desc, p.added_at, p.instructor_id), '[]'::jsonb)
      from public.grading_panel_members p join public.instructors i on i.id = p.instructor_id
      where p.grading_event_id = s.id)
  ) order by s.grading_date, s.starts_at nulls last, s.id), '[]'::jsonb)
  from sessions s;
$function$;
