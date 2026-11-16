-- Technique progress is a coaching record, not a grading requirement. Grading
-- is assessed on the separate A/B/C grading checklist, so readiness (and
-- everything built on it: invitations, checkout, endorsements, the student's own
-- checklist and the administrator list) no longer counts technique sign-offs.
-- Class-time progress is also not a grading record, so it no longer marks a
-- grading as started or needs the examiner panel.
begin;

create or replace function public.student_grading_readiness(target_student uuid)
returns table(target_grade_id text, target_grade_label text, track public.grade_track,
  sort smallint, key text, label text, actual text, required text, met boolean)
language sql stable security definer set search_path = '' as $$
  with base as (
    select st.*, (now() at time zone 'Asia/Singapore')::date as today,
      (extract(year from now() at time zone 'Asia/Singapore') - extract(year from st.date_of_birth))::int as age_years
    from public.students st where st.id = target_student
  ), student as (
    select b.*, case when b.age_years >= 13 then 'adult'::public.grade_track else 'children'::public.grade_track end as grade_track,
      coalesce(b.last_graded_at, b.joined_at) as cycle_start,
      b.age_years >= 13
        and b.current_grade_id in ('green-8th-kyu', 'purple-7th-kyu', 'blue-silver-6th-kyu', 'brown-silver-4th-kyu', 'black-silver-2nd-kyu')
        and b.last_graded_at is not null
        and extract(year from b.last_graded_at) - extract(year from b.date_of_birth) >= 13 as direct_entry
    from base b
  ), target as (
    select s.*, cur.is_ranked as current_ranked, nxt.grade_id as next_id, nxt.grade_label as next_label,
      nxt.target_track, nxt.min_months, nxt.max_months, nxt.min_sessions, nxt.min_age_years, nxt.max_age_years,
      (extract(year from age(s.today, s.cycle_start)) * 12 + extract(month from age(s.today, s.cycle_start)))::int as grade_months,
      (extract(year from age(s.today, s.joined_at)) * 12 + extract(month from age(s.today, s.joined_at)))::int as member_months,
      (select count(*) from public.event_students es
        join public.events ce on ce.id = es.event_id
        where es.student_id = s.id and ce.event_type = 'class'
          and ce.starts_at::date >= s.cycle_start
          and es.attendance_status in ('present', 'late'))::int as attended
    from student s
    join public.grades cur on cur.id = s.current_grade_id
    -- The student's own ladder first; a child with no further children's grade
    -- falls through to the adult ladder.
    join lateral (
      select grade.id as grade_id, grade.label as grade_label, gt.track as target_track, req.min_months, req.max_months,
        req.min_sessions, req.min_age_years, req.max_age_years
      from public.grades grade
      join public.grade_tracks gt on gt.grade_id = grade.id and (gt.track = s.grade_track or gt.track = 'adult')
      join public.grade_requirements req on req.grade_id = grade.id and req.track = gt.track
      where grade.sort_order > cur.sort_order
        and (req.max_age_years is null or s.age_years <= req.max_age_years)
      order by gt.track = s.grade_track desc, grade.sort_order
      limit 1
    ) nxt on true
  )
  select t.next_id, t.next_label, t.target_track, v.sort, v.key, v.label, v.actual, v.required, coalesce(v.met, false)
  from target t
  cross join lateral (values
    (1::smallint, 'membership', 'Active membership', initcap(t.membership_status::text), 'Active',
      t.membership_status = 'active', true),
    (2::smallint, 'membership-length', 'Time as a member',
      t.member_months || case when t.member_months = 1 then ' month' else ' months' end, '3 months',
      t.joined_at <= t.today - interval '3 months', true),
    (3::smallint, 'adult-age', 'Adult grading age (by year)', t.age_years || ' years', '13 years',
      t.age_years >= 13, t.target_track = 'adult' and t.grade_track = 'children'),
    (4::smallint, 'age', 'Minimum age (by year)', t.age_years || ' years', t.min_age_years || ' years',
      t.age_years >= t.min_age_years, t.min_age_years is not null),
    (5::smallint, 'max-age', 'Maximum age (by year)', t.age_years || ' years', t.max_age_years || ' years',
      t.age_years <= t.max_age_years, t.max_age_years is not null),
    (6::smallint, 'time', case when t.current_ranked then 'Time in current grade' else 'Practice since joining' end,
      t.grade_months || case when t.grade_months = 1 then ' month' else ' months' end,
      case when t.max_months is null then t.min_months || ' months' else t.min_months || '–' || t.max_months || ' months' end,
      t.cycle_start <= t.today - make_interval(months => t.min_months), t.min_months > 0 and not t.direct_entry),
    (6::smallint, 'direct-entry', 'Intermediate grade from last adult grading', 'Submit directly', 'Submit directly',
      true, t.direct_entry and (t.min_months > 0 or t.min_sessions is not null)),
    (7::smallint, 'sessions', 'Training sessions since last grading', t.attended::text, t.min_sessions::text,
      t.attended >= t.min_sessions, t.min_sessions is not null and not t.direct_entry),
    (9::smallint, 'fees', 'Fees up to date', case when t.outstanding_fees then 'Outstanding' else 'Clear' end, 'Clear',
      not t.outstanding_fees, true)
  ) as v(sort, key, label, actual, required, met, applies)
  where v.applies
  order by v.sort;
$$;

revoke all on function public.student_grading_readiness(uuid) from public, anon, authenticated;
grant execute on function public.student_grading_readiness(uuid) to service_role;

-- Administrator list without the technique column.
create or replace function public.admin_grading_eligibility(target_event uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today_sgt date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  if auth.uid() is null or not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  with open_gradings as (
    select gr.event_id, gr.grading_date, gr.track
    from public.gradings gr join public.events e on e.id = gr.event_id
    where gr.official_schedule and gr.application_status = 'open' and e.status = 'scheduled'
      and gr.grading_date > today_sgt and gr.application_opens_on <= today_sgt
      and gr.application_deadline >= today_sgt
      and (target_event is null or gr.event_id = target_event)
  ), candidates as (
    select distinct on (eg.student_id) eg.student_id, eg.target_grade_id, gr.track
    from open_gradings gr cross join lateral public.eligible_grading_students(gr.event_id) eg
    order by eg.student_id, gr.grading_date, gr.event_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
    'date_of_birth', s.date_of_birth, 'centre_name', c.name,
    'current_grade', current_grade.label, 'target_grade', target_grade.label,
    'track', candidate.track, 'joined_at', s.joined_at, 'last_graded_at', s.last_graded_at,
    'age_years', extract(year from today_sgt) - extract(year from s.date_of_birth),
    'membership_months', extract(year from age(today_sgt, s.joined_at)) * 12 + extract(month from age(today_sgt, s.joined_at)),
    'grade_months', extract(year from age(today_sgt, coalesce(s.last_graded_at, s.joined_at))) * 12 + extract(month from age(today_sgt, coalesce(s.last_graded_at, s.joined_at))),
    'min_months', req.min_months, 'max_months', req.max_months,
    'min_age_years', req.min_age_years, 'min_sessions', req.min_sessions,
    'sessions_attended', attended.total
  ) order by s.first_name, s.last_name, s.id), '[]'::jsonb) into result
  from candidates candidate
  join public.students s on s.id = candidate.student_id
  join public.centres c on c.id = s.home_centre_id
  join public.grades current_grade on current_grade.id = s.current_grade_id
  join public.grades target_grade on target_grade.id = candidate.target_grade_id
  join public.grade_requirements req on req.grade_id = candidate.target_grade_id and req.track = candidate.track
  cross join lateral (
    select count(*)::int as total from public.event_students es
    join public.events ce on ce.id = es.event_id
    where es.student_id = s.id and ce.event_type = 'class'
      and ce.starts_at::date >= coalesce(s.last_graded_at, s.joined_at)
      and es.attendance_status in ('present', 'late')
  ) attended;
  return result;
end;
$$;

revoke all on function public.admin_grading_eligibility(uuid) from public, anon;
grant execute on function public.admin_grading_eligibility(uuid) to authenticated;

-- Grading has started once batches or reviews exist; technique progress is not
-- a grading record.
create or replace function public.grading_started(target_event uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.grading_batches where event_id = target_event)
    or exists (select 1 from public.instructor_grading_reviews where event_id = target_event);
end;
$$;
revoke all on function public.grading_started(uuid) from public, anon;
grant execute on function public.grading_started(uuid) to authenticated;

-- Retire the earlier grading-time sign-off path, which some installations
-- have outside these migrations. Grading is marked on grading_batches (A/B/C);
-- nothing in the app calls these, and sign-offs recorded against an event are
-- not class-time progress. Dropping event_id also drops its foreign keys and
-- the (event_id, student_id, syllabus_item_id) unique key.
drop trigger if exists technique_sign_offs_enforce_panel on public.technique_sign_offs;
drop trigger if exists technique_sign_off_starts_assessment on public.technique_sign_offs;
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_instructor_assessment_technique', 'instructor_assessment_checklist',
        'finish_instructor_grading_review', 'start_assessment_from_technique')
  loop
    execute format('drop function %s', fn);
  end loop;
end;
$$;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'technique_sign_offs' and column_name = 'event_id') then
    execute 'delete from public.technique_sign_offs where event_id is not null';
    execute 'alter table public.technique_sign_offs drop column event_id';
  end if;
end;
$$;

commit;
