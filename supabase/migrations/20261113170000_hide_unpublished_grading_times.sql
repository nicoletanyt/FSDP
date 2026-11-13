-- Before a grading's schedule is published, its time is not final, so only the
-- chief examiner (and administrators) see it. Everyone else gets no start/end
-- time, which the app shows as "Time to be confirmed" / a date-only calendar entry.
-- Reporting times and session times already follow this rule.
--
-- Each function is patched from its live definition with an exact replacement;
-- the migration fails rather than silently doing nothing if a definition differs.
do $migration$
declare
  def text;
  patched text;
begin
  -- Gradings list: the same rule as reporting_time just above it.
  def := pg_get_functiondef('public.my_grading_panels()'::regprocedure);
  patched := replace(def,
    $old$select e.id, e.name, e.status, e.starts_at, e.ends_at, g.track, mine.is_chief,$old$,
    $new$select e.id, e.name, e.status,
      case when g.schedule_published_at is not null or mine.is_chief then e.starts_at end as starts_at,
      case when g.schedule_published_at is not null or mine.is_chief then e.ends_at end as ends_at,
      g.track, mine.is_chief,$new$);
  if patched = def then raise exception 'my_grading_panels: expected definition not found'; end if;
  execute patched;

  -- Grading day: `visible` is can_view_grading_schedule (administrator, chief, or published).
  def := pg_get_functiondef('public.examiner_grading_day(uuid)'::regprocedure);
  patched := replace(def,
    $old$'starts_at', e.starts_at, 'ends_at', e.ends_at,$old$,
    $new$'starts_at', case when visible then e.starts_at end, 'ends_at', case when visible then e.ends_at end,$new$);
  if patched = def then raise exception 'examiner_grading_day: expected definition not found'; end if;
  execute patched;

  -- Calendar: grading events keep their date but lose their time until published
  -- (instructors who are not on the panel see it once published, as before).
  def := pg_get_functiondef('public.instructor_calendar(timestamptz,timestamptz,integer,integer)'::regprocedure);
  patched := replace(def,
    $old$'items',coalesce((select jsonb_agg(to_jsonb(p.e)||jsonb_build_object($old$,
    $new$'items',coalesce((select jsonb_agg(to_jsonb(p.e)
        ||case when (p.gr).event_id is not null and (p.gr).schedule_published_at is null
            and not public.can_view_grading_schedule((p.e).id)
          then jsonb_build_object('starts_at',null,'ends_at',null) else '{}'::jsonb end
        ||jsonb_build_object($new$);
  if patched = def then raise exception 'instructor_calendar: expected definition not found'; end if;
  execute patched;
end;
$migration$;
