begin;

-- Grading-day auto-scheduler. Administrators generate a draft schedule from the
-- rules below once applications close, adjust it, then publish it. Until it is
-- published only administrators and the chief examiner can see the sessions.

-- One row of scheduling rules per track (children and adults grade on separate days).
create table public.grading_schedule_rules (
  track public.grade_track primary key,
  -- Used only when the venue (centre) has no capacity of its own.
  default_capacity smallint not null default 30 check (default_capacity > 0),
  -- Groups smaller than this may be merged with a neighbouring grade.
  min_session_size smallint not null default 6 check (min_session_size > 0),
  -- Length of a transition with no entry in grading_session_durations.
  default_session_minutes smallint not null default 60 check (default_session_minutes between 5 and 600),
  day_start time not null default '09:00',
  day_end time not null default '21:00',
  lunch_start time not null default '12:00',
  lunch_end time not null default '13:00',
  changeover_minutes smallint not null default 15 check (changeover_minutes between 0 and 120),
  updated_at timestamptz not null default now(),
  constraint grading_schedule_rules_day_check check (day_start < day_end),
  constraint grading_schedule_rules_lunch_check check (lunch_start < lunch_end and lunch_start >= day_start and lunch_end <= day_end)
);

-- Session length per grade transition. A null from_grade_id applies to every
-- current grade going to to_grade_id; an exact transition overrides it.
create table public.grading_session_durations (
  id uuid primary key default gen_random_uuid(),
  track public.grade_track not null,
  from_grade_id text references public.grades(id) on delete cascade,
  to_grade_id text not null references public.grades(id) on delete cascade,
  minutes smallint not null check (minutes between 5 and 600),
  created_at timestamptz not null default now()
);
create unique index grading_session_durations_transition_key
  on public.grading_session_durations(track, coalesce(from_grade_id, ''), to_grade_id);

alter table public.grading_schedule_rules enable row level security;
alter table public.grading_session_durations enable row level security;
revoke all on public.grading_schedule_rules, public.grading_session_durations from anon;
grant select, insert, update, delete on public.grading_schedule_rules, public.grading_session_durations to authenticated;
create policy "Administrators manage grading schedule rules" on public.grading_schedule_rules
for all to authenticated using ((select public.is_administrator())) with check ((select public.is_administrator()));
create policy "Administrators manage grading session durations" on public.grading_session_durations
for all to authenticated using ((select public.is_administrator())) with check ((select public.is_administrator()));

-- Children's lengths are not yet known: they use the track default until set.
insert into public.grading_schedule_rules(track) values ('children'), ('adult') on conflict do nothing;
-- Placeholder adult lengths (75 / 90 / 120 minutes); administrators correct them on the rules page.
insert into public.grading_session_durations(track, from_grade_id, to_grade_id, minutes)
select 'adult', null, gt.grade_id, case
    when gt.grade_id in ('blue-6th-kyu', 'blue-gold-5th-kyu', 'brown-4th-kyu') then 75
    when gt.grade_id in ('brown-gold-3rd-kyu', 'black-2nd-kyu', 'black-gold-1st-kyu') then 90
    else 120 end
from public.grade_tracks gt
where gt.track = 'adult' and (gt.grade_id in ('blue-6th-kyu', 'blue-gold-5th-kyu', 'brown-4th-kyu',
    'brown-gold-3rd-kyu', 'black-2nd-kyu', 'black-gold-1st-kyu') or gt.grade_id like '%-dan')
on conflict do nothing;

-- Private gradings are scheduled by hand. A schedule is a draft until published.
alter table public.gradings add column is_private boolean not null default false,
  add column schedule_published_at timestamptz;
-- Existing sorted days and already-released reporting times stay visible.
update public.gradings g set schedule_published_at = now()
where exists (select 1 from public.grading_sessions s where s.grading_event_id = g.event_id)
  or g.reporting_release_on <= (now() at time zone 'Asia/Singapore')::date;

-- Administrators always; panel examiners once published; the chief examiner
-- also while it is a draft (read-only: every write below is admin-only).
create function public.can_view_grading_schedule(target_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select public.is_administrator()) or exists (
    select 1 from public.grading_panel_members m join public.gradings g on g.event_id = m.grading_event_id
    where m.grading_event_id = target_event and m.instructor_id = (select public.current_instructor_id())
      and (m.is_chief or g.schedule_published_at is not null));
$$;
revoke all on function public.can_view_grading_schedule(uuid) from public, anon;
grant execute on function public.can_view_grading_schedule(uuid) to authenticated;

drop policy "Administrators and panel examiners read grading sessions" on public.grading_sessions;
create policy "Administrators and panel examiners read grading sessions" on public.grading_sessions
for select to authenticated using (public.can_view_grading_schedule(grading_event_id));

-- The venue's capacity, or the track default when the centre has none.
create function public.grading_capacity(target_event uuid)
returns table(capacity integer, from_venue boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(c.capacity::integer, r.default_capacity::integer), c.capacity is not null
  from public.events e
  join public.centres c on c.id = e.centre_id
  join public.gradings g on g.event_id = e.id
  left join public.grading_schedule_rules r on r.track = g.track
  where e.id = target_event;
$$;
revoke all on function public.grading_capacity(uuid) from public, anon;
grant execute on function public.grading_capacity(uuid) to authenticated;

-- Exact transition, else any current grade to that target, else the track default.
create function public.grading_transition_minutes(target_track public.grade_track, from_grade text, to_grade text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select d.minutes from public.grading_session_durations d
      where d.track = target_track and d.from_grade_id = from_grade and d.to_grade_id = to_grade),
    (select d.minutes from public.grading_session_durations d
      where d.track = target_track and d.from_grade_id is null and d.to_grade_id = to_grade),
    (select r.default_session_minutes from public.grading_schedule_rules r where r.track = target_track))::integer;
$$;
revoke all on function public.grading_transition_minutes(public.grade_track, text, text) from public, anon;
grant execute on function public.grading_transition_minutes(public.grade_track, text, text) to authenticated;

-- A session lasts as long as its longest transition; an empty one the default.
create function public.grading_session_minutes(target_session uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(max(public.grading_transition_minutes(g.track, s.current_grade_id, ga.target_grade_id)),
    (select r.default_session_minutes from public.grading_schedule_rules r where r.track = g.track))::integer
  from public.grading_sessions gs
  join public.gradings g on g.event_id = gs.grading_event_id
  left join public.grading_applications ga on ga.session_id = gs.id and ga.status <> 'withdrawn'
  left join public.students s on s.id = ga.student_id
  where gs.id = target_session
  group by g.track;
$$;
revoke all on function public.grading_session_minutes(uuid) from public, anon, authenticated;

-- Lay the day's sessions out back to back in position order: from the day
-- start, never across lunch, with a changeover between sessions. Sessions past
-- the day end are still placed; the overflow is reported as a warning.
create function public.retime_grading_sessions(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rules public.grading_schedule_rules%rowtype;
  day date;
  cursor_at timestamptz;
  lunch_from timestamptz;
  lunch_to timestamptz;
  session_row record;
  minutes integer;
  starts timestamptz;
begin
  select r.* into rules from public.gradings g join public.grading_schedule_rules r on r.track = g.track
    where g.event_id = target_event;
  if not found then raise exception 'Set the grading''s track and its scheduling rules first' using errcode = 'PGS01'; end if;
  select coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date) into day
    from public.gradings g join public.events e on e.id = g.event_id where g.event_id = target_event;
  if day is null then raise exception 'Set the grading date before scheduling' using errcode = 'PGS01'; end if;
  cursor_at := (day + rules.day_start) at time zone 'Asia/Singapore';
  lunch_from := (day + rules.lunch_start) at time zone 'Asia/Singapore';
  lunch_to := (day + rules.lunch_end) at time zone 'Asia/Singapore';
  for session_row in select id from public.grading_sessions where grading_event_id = target_event order by position loop
    minutes := public.grading_session_minutes(session_row.id);
    starts := cursor_at;
    if starts < lunch_to and starts + make_interval(mins => minutes) > lunch_from then starts := lunch_to; end if;
    update public.grading_sessions set starts_at = starts, ends_at = starts + make_interval(mins => minutes)
      where id = session_row.id;
    cursor_at := starts + make_interval(mins => minutes + rules.changeover_minutes);
  end loop;
end;
$$;
revoke all on function public.retime_grading_sessions(uuid) from public, anon, authenticated;

create function public.renumber_grading_sessions(target_event uuid)
returns void language sql security definer set search_path = '' as $$
  update public.grading_sessions s set position = ordered.position
  from (select id, row_number() over (order by position)::integer as position
    from public.grading_sessions where grading_event_id = target_event) ordered
  where s.id = ordered.id and s.position <> ordered.position;
$$;
revoke all on function public.renumber_grading_sessions(uuid) from public, anon, authenticated;

-- Checks shared by every schedule change; locks the grading's event row.
create function public.prepare_grading_schedule_change(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype;
begin
  if not (select public.is_administrator()) then
    raise exception 'Only administrators can change grading sessions' using errcode = '42501';
  end if;
  select * into event_row from public.events where id = target_event for update;
  if not found or not exists (select 1 from public.gradings where event_id = target_event) then
    raise exception 'Grading session not found' using errcode = '22023';
  end if;
  if event_row.status = 'cancelled' then raise exception 'Cancelled gradings cannot be changed' using errcode = 'PGS01'; end if;
  if public.grading_started(target_event) then
    raise exception 'Grading has started, so sessions are locked' using errcode = 'PGS02';
  end if;
end;
$$;
revoke all on function public.prepare_grading_schedule_change(uuid) from public, anon, authenticated;

-- Every change made after publishing turns the schedule back into a draft.
create function public.finish_grading_schedule_change(target_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.renumber_grading_sessions(target_event);
  perform public.retime_grading_sessions(target_event);
  update public.gradings set schedule_published_at = null where event_id = target_event;
  return public.examiner_grading_day(target_event);
end;
$$;
revoke all on function public.finish_grading_schedule_change(uuid) from public, anon, authenticated;

-- Problems an administrator should see before publishing, most serious first.
create function public.grading_schedule_warnings(target_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb := '[]'::jsonb;
  rules public.grading_schedule_rules%rowtype;
  capacity_row record;
  day date;
  day_end timestamptz;
  item record;
begin
  if not ((select public.is_administrator()) or exists (select 1 from public.grading_panel_members m
    where m.grading_event_id = target_event and m.is_chief and m.instructor_id = (select public.current_instructor_id()))) then
    return result;
  end if;
  if not exists (select 1 from public.grading_sessions where grading_event_id = target_event) then return result; end if;
  select r.* into rules from public.gradings g join public.grading_schedule_rules r on r.track = g.track
    where g.event_id = target_event;
  select coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date) into day
    from public.gradings g join public.events e on e.id = g.event_id where g.event_id = target_event;
  select * into capacity_row from public.grading_capacity(target_event);

  if rules.track is not null and day is not null then
    day_end := (day + rules.day_end) at time zone 'Asia/Singapore';
    select count(*)::integer as sessions, coalesce(jsonb_agg(gs.id order by gs.position), '[]'::jsonb) as ids,
      coalesce(sum((select count(*) from public.grading_applications ga where ga.session_id = gs.id and ga.status <> 'withdrawn')), 0)::integer as candidates,
      max(gs.ends_at) as last_end
      into item from public.grading_sessions gs where gs.grading_event_id = target_event and gs.ends_at > day_end;
    if item.sessions > 0 then
      result := result || jsonb_build_object('code', 'overflow', 'session_ids', item.ids,
        'message', format('%s %s with %s %s %s past %s (the last ends at %s). Nobody has been moved to another day.',
          item.sessions, case when item.sessions = 1 then 'session' else 'sessions' end,
          item.candidates, case when item.candidates = 1 then 'candidate' else 'candidates' end,
          case when item.sessions = 1 then 'runs' else 'run' end,
          ltrim(to_char(rules.day_end, 'HH12:MI am'), '0'),
          ltrim(to_char(item.last_end at time zone 'Asia/Singapore', 'HH12:MI am'), '0')));
    end if;
  end if;

  for item in
    select gs.id, gs.position, count(ga.id)::integer as candidates from public.grading_sessions gs
    join public.grading_applications ga on ga.session_id = gs.id and ga.status <> 'withdrawn'
    where gs.grading_event_id = target_event group by gs.id, gs.position
    having count(ga.id) > capacity_row.capacity order by gs.position
  loop
    result := result || jsonb_build_object('code', 'over_capacity', 'session_ids', jsonb_build_array(item.id),
      'message', format('Session %s has %s candidates, more than the venue capacity of %s.', item.position, item.candidates, capacity_row.capacity));
  end loop;

  for item in
    select gs.id, gs.position from public.grading_sessions gs
    join public.gradings g on g.event_id = gs.grading_event_id
    join public.grading_applications ga on ga.session_id = gs.id and ga.status <> 'withdrawn'
    join public.students s on s.id = ga.student_id
    where gs.grading_event_id = target_event group by gs.id, gs.position, g.track
    having count(distinct public.grading_transition_minutes(g.track, s.current_grade_id, ga.target_grade_id)) > 1
    order by gs.position
  loop
    result := result || jsonb_build_object('code', 'mixed_lengths', 'session_ids', jsonb_build_array(item.id),
      'message', format('Session %s mixes grades with different session lengths, so it uses the longest.', item.position));
  end loop;

  for item in
    select gs.id, gs.position from public.grading_sessions gs
    where gs.grading_event_id = target_event and not exists (
      select 1 from public.grading_applications ga where ga.session_id = gs.id and ga.status <> 'withdrawn')
    order by gs.position
  loop
    result := result || jsonb_build_object('code', 'empty_session', 'session_ids', jsonb_build_array(item.id),
      'message', format('Session %s has no candidates.', item.position));
  end loop;

  select count(*)::integer as n into item from public.grading_applications
    where grading_event_id = target_event and status <> 'withdrawn' and session_id is null;
  if item.n > 0 then
    result := result || jsonb_build_object('code', 'unscheduled', 'session_ids', '[]'::jsonb,
      'message', format('%s %s not in a session.', item.n, case when item.n = 1 then 'applicant is' else 'applicants are' end));
  end if;

  if capacity_row.from_venue is false then
    result := result || jsonb_build_object('code', 'default_capacity', 'session_ids', '[]'::jsonb,
      'message', format('The venue has no capacity set, so the default of %s was used.', capacity_row.capacity));
  end if;
  return result;
end;
$$;
revoke all on function public.grading_schedule_warnings(uuid) from public, anon;
grant execute on function public.grading_schedule_warnings(uuid) to authenticated;

-- One grading day: its details, every applicant (sorted or not), and its
-- sessions. Examiners other than the chief see no sessions until publishing.
create or replace function public.examiner_grading_day(target_event uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := (select public.current_instructor_id());
  visible boolean;
  result jsonb;
begin
  if not exists (select 1 from public.gradings where event_id = target_event) then
    raise exception 'Grading session not found' using errcode = '22023';
  end if;
  if not ((select public.is_administrator()) or public.is_on_grading_panel(target_event)) then
    raise exception 'Only examiners on this grading''s panel can grade it' using errcode = 'PGP01';
  end if;
  visible := public.can_view_grading_schedule(target_event);
  with applicants as (
    select ga.id as application_id, ga.session_id, ga.target_grade_id, s.id as student_id, s.first_name, s.last_name,
      coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.email) as name, s.member_no,
      es.candidate_number, s.current_grade_id,
      jsonb_build_object('id', tg.id, 'label', tg.label, 'colour', tg.colour, 'is_ranked', tg.is_ranked, 'sort_order', tg.sort_order) as target_grade,
      tg.sort_order as target_order,
      (select cg.sort_order from public.grades cg where cg.id = s.current_grade_id) as current_order,
      (select jsonb_build_object('id', cg.id, 'label', cg.label, 'colour', cg.colour, 'is_ranked', cg.is_ranked, 'sort_order', cg.sort_order)
        from public.grades cg where cg.id = s.current_grade_id) as current_grade
    from public.grading_applications ga
    join public.students s on s.id = ga.student_id
    join public.grades tg on tg.id = ga.target_grade_id
    left join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id
    where ga.grading_event_id = target_event and ga.status <> 'withdrawn'
  )
  select jsonb_build_object(
    'event_id', e.id, 'name', e.name, 'status', e.status, 'track', g.track,
    'grading_date', coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date),
    'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'reporting_time', case when visible then g.reporting_time end,
    'application_deadline', g.application_deadline,
    'grading_started', public.grading_started(e.id),
    'is_private', g.is_private,
    'published_at', g.schedule_published_at,
    'capacity', (select gc.capacity from public.grading_capacity(e.id) gc),
    'warnings', public.grading_schedule_warnings(e.id),
    'centre', jsonb_build_object('name', c.name, 'address', c.address),
    'is_chief', coalesce((select m.is_chief from public.grading_panel_members m
      where m.grading_event_id = e.id and m.instructor_id = me), false),
    'panel', (select coalesce(jsonb_agg(jsonb_build_object(
        'instructor_id', p.instructor_id, 'name', trim(i.first_name || ' ' || i.last_name), 'is_chief', p.is_chief)
        order by p.is_chief desc, p.added_at, p.instructor_id), '[]'::jsonb)
      from public.grading_panel_members p join public.instructors i on i.id = p.instructor_id
      where p.grading_event_id = e.id),
    'students', (select coalesce(jsonb_agg(jsonb_build_object(
        'application_id', a.application_id, 'student_id', a.student_id, 'name', a.name, 'member_no', a.member_no,
        'candidate_number', a.candidate_number, 'current_grade', a.current_grade, 'target_grade', a.target_grade,
        'session_id', case when visible then a.session_id end)
        order by a.candidate_number nulls last, a.last_name, a.first_name, a.student_id), '[]'::jsonb)
      from applicants a),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', gs.id, 'position', gs.position, 'starts_at', gs.starts_at, 'ends_at', gs.ends_at,
        'grades', (select coalesce(jsonb_agg(jsonb_build_object('grade', grouped.target_grade, 'candidates', grouped.candidates)
            order by grouped.target_order, grouped.target_grade_id), '[]'::jsonb)
          from (select a.target_grade_id, a.target_grade, a.target_order,
              jsonb_agg(jsonb_build_object('application_id', a.application_id, 'student_id', a.student_id, 'name', a.name,
                'member_no', a.member_no, 'candidate_number', a.candidate_number, 'current_grade', a.current_grade)
                order by a.candidate_number nulls last, a.last_name, a.first_name, a.student_id) as candidates
            from applicants a where a.session_id = gs.id
            group by a.target_grade_id, a.target_grade, a.target_order) grouped),
        'transitions', (select coalesce(jsonb_agg(jsonb_build_object('from', t.current_grade, 'to', t.target_grade,
              'candidates', t.candidates, 'minutes', t.minutes)
            order by t.target_order, t.current_order nulls first, t.target_grade_id, t.current_grade_id), '[]'::jsonb)
          from (select a.current_grade_id, a.current_grade, a.current_order, a.target_grade_id, a.target_grade, a.target_order,
              count(*)::integer as candidates,
              public.grading_transition_minutes(g.track, a.current_grade_id, a.target_grade_id) as minutes
            from applicants a where a.session_id = gs.id
            group by a.current_grade_id, a.current_grade, a.current_order, a.target_grade_id, a.target_grade, a.target_order) t),
        'my_batch', (select jsonb_build_object('status', b.status, 'version', b.version,
            'updated_at', b.updated_at, 'submitted_at', b.submitted_at)
          from public.grading_batches b where b.session_id = gs.id and b.instructor_id = me))
        order by gs.position), '[]'::jsonb)
      from public.grading_sessions gs where gs.grading_event_id = e.id and visible)
  ) into result
  from public.gradings g join public.events e on e.id = g.event_id join public.centres c on c.id = e.centre_id
  where g.event_id = target_event;
  return result;
end;
$$;

-- Generate a draft schedule from the rules. Re-running discards manual changes.
--  1. Group applicants by transition (current grade -> target grade).
--  2. Split groups larger than the venue capacity evenly (50 at 30 -> 25 + 25).
--  3. Merge groups smaller than the minimum session size into an adjacent group
--     of a neighbouring grade with the same session length, if both fit.
--  4. Order lowest grade first, then place on the day's timeline.
create or replace function public.sort_grading_sessions(target_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  grading public.gradings%rowtype;
  rules public.grading_schedule_rules%rowtype;
  cap integer;
  grp record;
  small record;
  best record;
  part_row record;
  candidate record;
  k integer;
  next_part integer := 0;
  position_no integer := 0;
  created uuid;
  merged boolean;
begin
  perform public.prepare_grading_schedule_change(target_event);
  select * into grading from public.gradings where event_id = target_event;
  if grading.application_deadline is not null and (now() at time zone 'Asia/Singapore')::date <= grading.application_deadline then
    raise exception 'Applications are still open' using errcode = 'PGS01';
  end if;
  if grading.track is null then raise exception 'Set the grading''s track before sorting' using errcode = 'PGS01'; end if;
  if grading.is_private then raise exception 'Private gradings are scheduled by hand' using errcode = 'PGS01'; end if;
  select * into rules from public.grading_schedule_rules where track = grading.track;
  if not found then raise exception 'Set the scheduling rules for this track first' using errcode = 'PGS01'; end if;
  select gc.capacity into cap from public.grading_capacity(target_event) gc;

  drop table if exists pg_temp.schedule_candidates;
  drop table if exists pg_temp.schedule_parts;
  create temporary table schedule_candidates (
    application_id uuid primary key, student_id uuid, from_grade text, to_grade text,
    from_order integer, to_order integer, to_idx integer, minutes integer,
    last_name text, first_name text, part integer
  ) on commit drop;
  create temporary table schedule_parts (
    part integer primary key, size integer, minutes integer, lo_idx integer, hi_idx integer
  ) on commit drop;

  insert into pg_temp.schedule_candidates
  select ga.id, ga.student_id, s.current_grade_id, ga.target_grade_id, coalesce(cg.sort_order, -1), tg.sort_order,
    ladder.idx, public.grading_transition_minutes(grading.track, s.current_grade_id, ga.target_grade_id),
    s.last_name, s.first_name, null
  from public.grading_applications ga
  join public.students s on s.id = ga.student_id
  join public.grades tg on tg.id = ga.target_grade_id
  left join public.grades cg on cg.id = s.current_grade_id
  -- Position on the track's ladder; a grade off the ladder has no neighbours.
  left join (select gt.grade_id, row_number() over (order by lg.sort_order, lg.id)::integer as idx
      from public.grade_tracks gt join public.grades lg on lg.id = gt.grade_id where gt.track = grading.track) ladder
    on ladder.grade_id = ga.target_grade_id
  where ga.grading_event_id = target_event and ga.status <> 'withdrawn';

  -- 1 and 2: one group per transition, split into k near-equal parts.
  for grp in
    select from_grade, to_grade, count(*)::integer as n from pg_temp.schedule_candidates
    group by from_grade, to_grade order by min(to_order), min(from_order), to_grade, from_grade
  loop
    k := ceil(grp.n::numeric / cap)::integer;
    update pg_temp.schedule_candidates c set part = next_part + ((ranked.rn - 1) * k) / grp.n
    from (select application_id, row_number() over (order by last_name, first_name, student_id)::integer as rn
        from pg_temp.schedule_candidates where from_grade = grp.from_grade and to_grade = grp.to_grade) ranked
    where c.application_id = ranked.application_id;
    next_part := next_part + k;
  end loop;
  insert into pg_temp.schedule_parts
    select part, count(*), max(minutes), min(to_idx), max(to_idx) from pg_temp.schedule_candidates group by part;

  -- 3: merge the smallest small group into its best adjacent neighbour, repeatedly.
  loop
    merged := false;
    for small in select * from pg_temp.schedule_parts where size < rules.min_session_size order by size, part loop
      select p.part into best from pg_temp.schedule_parts p
      where p.part in ((select max(q.part) from pg_temp.schedule_parts q where q.part < small.part),
          (select min(q.part) from pg_temp.schedule_parts q where q.part > small.part))
        and p.minutes = small.minutes and p.size + small.size <= cap
        and (case when p.part < small.part then small.lo_idx - p.hi_idx else p.lo_idx - small.hi_idx end) between 0 and 1
      order by p.size, p.part limit 1;
      if found then
        update pg_temp.schedule_candidates set part = best.part where part = small.part;
        update pg_temp.schedule_parts p set size = p.size + small.size,
          lo_idx = least(p.lo_idx, small.lo_idx), hi_idx = greatest(p.hi_idx, small.hi_idx) where p.part = best.part;
        delete from pg_temp.schedule_parts where part = small.part;
        merged := true;
        exit;
      end if;
    end loop;
    exit when not merged;
  end loop;

  -- 4: lowest grade first, then the timeline.
  delete from public.grading_sessions where grading_event_id = target_event;
  for part_row in
    select part from pg_temp.schedule_candidates group by part order by min(to_order), min(from_order), part
  loop
    position_no := position_no + 1;
    insert into public.grading_sessions(grading_event_id, position) values (target_event, position_no) returning id into created;
    update public.grading_applications ga set session_id = created
      from pg_temp.schedule_candidates c where c.part = part_row.part and ga.id = c.application_id;
  end loop;
  perform public.retime_grading_sessions(target_event);

  -- One row at a time so the numbering trigger assigns 1..n in session order.
  delete from public.event_students where event_id = target_event;
  for candidate in
    select ga.student_id from public.grading_applications ga
    join public.grading_sessions gs on gs.id = ga.session_id
    join public.grades gr on gr.id = ga.target_grade_id
    join public.students s on s.id = ga.student_id
    where ga.grading_event_id = target_event and ga.status <> 'withdrawn'
    order by gs.position, gr.sort_order, s.last_name, s.first_name, s.id
  loop
    insert into public.event_students(event_id, student_id) values (target_event, candidate.student_id);
  end loop;
  drop table pg_temp.schedule_candidates;
  drop table pg_temp.schedule_parts;
  update public.gradings set schedule_published_at = null where event_id = target_event;
  return public.examiner_grading_day(target_event);
end;
$$;

-- Move one applicant into another session. A session left empty is removed;
-- the day is re-timed. An applicant not yet on the roster is added to it.
create or replace function public.move_grading_candidate(target_application uuid, target_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  application public.grading_applications%rowtype;
  previous uuid;
begin
  if not (select public.is_administrator()) then
    raise exception 'Only administrators can move grading candidates' using errcode = '42501';
  end if;
  select * into application from public.grading_applications where id = target_application;
  if not found or application.status = 'withdrawn' then
    raise exception 'Grading application not found' using errcode = '22023';
  end if;
  perform public.prepare_grading_schedule_change(application.grading_event_id);
  if not exists (select 1 from public.grading_sessions where id = target_session and grading_event_id = application.grading_event_id) then
    raise exception 'Choose a session from the same grading' using errcode = '22023';
  end if;
  previous := application.session_id;
  update public.grading_applications set session_id = target_session where id = target_application;
  insert into public.event_students(event_id, student_id) values (application.grading_event_id, application.student_id)
    on conflict (event_id, student_id) do nothing;
  if previous is not null and previous <> target_session and not exists (
    select 1 from public.grading_applications where session_id = previous and status <> 'withdrawn') then
    delete from public.grading_sessions where id = previous;
  end if;
  return public.finish_grading_schedule_change(application.grading_event_id);
end;
$$;

-- Move the chosen candidates of a session into a new session straight after it.
create function public.split_grading_session(target_session uuid, applications uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  session_row public.grading_sessions%rowtype;
  created uuid;
begin
  if not (select public.is_administrator()) then
    raise exception 'Only administrators can change grading sessions' using errcode = '42501';
  end if;
  select * into session_row from public.grading_sessions where id = target_session;
  if not found then raise exception 'Grading session not found' using errcode = '22023'; end if;
  perform public.prepare_grading_schedule_change(session_row.grading_event_id);
  if applications is null or cardinality(applications) = 0 then
    raise exception 'Choose who moves to the new session' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(applications) chosen(id) where not exists (select 1 from public.grading_applications ga
    where ga.id = chosen.id and ga.session_id = target_session and ga.status <> 'withdrawn')) then
    raise exception 'Choose candidates from this session' using errcode = '22023';
  end if;
  if not exists (select 1 from public.grading_applications ga where ga.session_id = target_session
    and ga.status <> 'withdrawn' and ga.id <> all(applications)) then
    raise exception 'Leave at least one candidate in the session' using errcode = '22023';
  end if;
  update public.grading_sessions set position = position + 1
    where grading_event_id = session_row.grading_event_id and position > session_row.position;
  insert into public.grading_sessions(grading_event_id, position)
    values (session_row.grading_event_id, session_row.position + 1) returning id into created;
  update public.grading_applications set session_id = created where id = any(applications);
  return public.finish_grading_schedule_change(session_row.grading_event_id);
end;
$$;
revoke all on function public.split_grading_session(uuid, uuid[]) from public, anon;
grant execute on function public.split_grading_session(uuid, uuid[]) to authenticated;

-- Move every candidate of one session into another and remove the first.
create function public.merge_grading_sessions(source_session uuid, into_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  source_row public.grading_sessions%rowtype;
begin
  if not (select public.is_administrator()) then
    raise exception 'Only administrators can change grading sessions' using errcode = '42501';
  end if;
  select * into source_row from public.grading_sessions where id = source_session;
  if not found then raise exception 'Grading session not found' using errcode = '22023'; end if;
  perform public.prepare_grading_schedule_change(source_row.grading_event_id);
  if source_session = into_session or not exists (select 1 from public.grading_sessions
    where id = into_session and grading_event_id = source_row.grading_event_id) then
    raise exception 'Choose another session from the same grading' using errcode = '22023';
  end if;
  update public.grading_applications set session_id = into_session where session_id = source_session;
  delete from public.grading_sessions where id = source_session;
  return public.finish_grading_schedule_change(source_row.grading_event_id);
end;
$$;
revoke all on function public.merge_grading_sessions(uuid, uuid) from public, anon;
grant execute on function public.merge_grading_sessions(uuid, uuid) to authenticated;

-- A new session at the end of the day, mainly for private gradings (which are
-- scheduled by hand). Every applicant not yet in a session goes into it, and
-- onto the roster; with nobody unplaced it starts empty.
create function public.add_grading_session(target_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  created uuid;
  candidate record;
begin
  perform public.prepare_grading_schedule_change(target_event);
  insert into public.grading_sessions(grading_event_id, position)
    select target_event, coalesce(max(position), 0) + 1 from public.grading_sessions where grading_event_id = target_event
    returning id into created;
  for candidate in
    select ga.id, ga.student_id from public.grading_applications ga
    join public.grades gr on gr.id = ga.target_grade_id
    join public.students s on s.id = ga.student_id
    where ga.grading_event_id = target_event and ga.status <> 'withdrawn' and ga.session_id is null
    order by gr.sort_order, s.last_name, s.first_name, s.id
  loop
    update public.grading_applications set session_id = created where id = candidate.id;
    insert into public.event_students(event_id, student_id) values (target_event, candidate.student_id)
      on conflict (event_id, student_id) do nothing;
  end loop;
  return public.finish_grading_schedule_change(target_event);
end;
$$;
revoke all on function public.add_grading_session(uuid) from public, anon;
grant execute on function public.add_grading_session(uuid) to authenticated;

-- Publishing shows the sessions to every examiner on the panel and releases the
-- reporting time. Overflow past the day end is a warning, not a blocker.
create function public.publish_grading_schedule(target_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.prepare_grading_schedule_change(target_event);
  if not exists (select 1 from public.grading_sessions where grading_event_id = target_event) then
    raise exception 'Sort candidates into sessions before publishing' using errcode = 'PGS01';
  end if;
  if exists (select 1 from public.grading_applications where grading_event_id = target_event
    and status <> 'withdrawn' and session_id is null) then
    raise exception 'Place every applicant in a session before publishing' using errcode = 'PGS01';
  end if;
  if exists (select 1 from public.grading_sessions gs where gs.grading_event_id = target_event and not exists (
    select 1 from public.grading_applications ga where ga.session_id = gs.id and ga.status <> 'withdrawn')) then
    raise exception 'Remove empty sessions before publishing' using errcode = 'PGS01';
  end if;
  update public.events e set starts_at = span.first_start, ends_at = span.last_end
    from (select min(starts_at) as first_start, max(ends_at) as last_end from public.grading_sessions
      where grading_event_id = target_event) span
    where e.id = target_event;
  update public.gradings set schedule_published_at = now() where event_id = target_event;
  return public.examiner_grading_day(target_event);
end;
$$;
revoke all on function public.publish_grading_schedule(uuid) from public, anon;
grant execute on function public.publish_grading_schedule(uuid) to authenticated;

create function public.unpublish_grading_schedule(target_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.prepare_grading_schedule_change(target_event);
  update public.gradings set schedule_published_at = null where event_id = target_event;
  return public.examiner_grading_day(target_event);
end;
$$;
revoke all on function public.unpublish_grading_schedule(uuid) from public, anon;
grant execute on function public.unpublish_grading_schedule(uuid) to authenticated;

-- Examiners cannot start a checklist on a draft schedule.
create function public.grading_batch_requires_published()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.gradings where event_id = new.event_id and schedule_published_at is not null) then
    raise exception 'This grading''s schedule has not been published yet' using errcode = 'PGB04';
  end if;
  return new;
end;
$$;
revoke all on function public.grading_batch_requires_published() from public, anon, authenticated;
create trigger grading_batches_require_published before insert on public.grading_batches
for each row execute function public.grading_batch_requires_published();

-- Examiners' list: the reporting time is released with the schedule.
create or replace function public.my_grading_panels()
returns jsonb language sql stable set search_path to '' as $function$
  with mine as (
    select m.grading_event_id, m.is_chief from public.grading_panel_members m
    where m.instructor_id = (select public.current_instructor_id())
  ), sessions as (
    select e.id, e.name, e.status, e.starts_at, e.ends_at, g.track, mine.is_chief,
      case when g.schedule_published_at is not null or mine.is_chief then g.reporting_time end as reporting_time,
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

-- Students: the reporting time appears once its release date arrives and the schedule is published.
create or replace function public.my_grading_opportunities()
returns table(id uuid, name text, grading_date date, application_deadline date,
  reporting_release_on date, reporting_time time without time zone,
  centre_name text, venue_address text, target_grade text, applied boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date),
    g.application_deadline, g.reporting_release_on,
    case when g.reporting_release_on <= (now() at time zone 'Asia/Singapore')::date
      and g.schedule_published_at is not null then g.reporting_time else null end,
    c.name, c.address,
    coalesce(eligible.target_grade_id, a.target_grade_id), a.id is not null
  from public.students s
  join public.events e on e.event_type = 'grading'
  join public.gradings g on g.event_id = e.id and (g.official_schedule or e.centre_id = s.home_centre_id)
  join public.centres c on c.id = e.centre_id
  left join lateral (select eg.target_grade_id from public.eligible_grading_students(e.id) eg where eg.student_id = s.id) eligible on true
  left join public.grading_applications a on a.student_id = s.id and a.grading_event_id = e.id
  where s.user_id = (select auth.uid()) and (eligible.target_grade_id is not null or a.id is not null)
    and (g.grading_date is null and e.starts_at > now() or g.grading_date >= (now() at time zone 'Asia/Singapore')::date)
  order by coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date);
$$;

commit;
