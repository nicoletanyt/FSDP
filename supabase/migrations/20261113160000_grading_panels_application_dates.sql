-- The examiner's gradings list shows each grading's status pill (Not open yet →
-- Applications open → Closed → Completed), which needs its application window.
-- Re-created from the live definition; the only change is the two application dates.
CREATE OR REPLACE FUNCTION public.my_grading_panels()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with mine as (
    select m.grading_event_id, m.is_chief from public.grading_panel_members m
    where m.instructor_id = (select public.current_instructor_id())
  ), sessions as (
    select e.id, e.name, e.status, e.starts_at, e.ends_at, g.track, mine.is_chief,
      case when g.schedule_published_at is not null or mine.is_chief then g.reporting_time end as reporting_time,
      coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date) as grading_date,
      g.application_opens_on, g.application_deadline,
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
    'application_opens_on', s.application_opens_on, 'application_deadline', s.application_deadline,
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
