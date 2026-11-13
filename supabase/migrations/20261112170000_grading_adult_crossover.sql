-- Students register for adult grading from the year they turn 13. A child at
-- the top of the children's ladder (2nd Kyu Black-Silver) therefore has no
-- further children's grade: their next grade is the first adult grade above
-- theirs (1st Kyu Black-Gold, adult sheet crossover note). It is shown with an
-- unmet "13 years (by year)" requirement until they reach adult age.
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
      coalesce(b.last_graded_at, b.joined_at) as cycle_start
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
          and es.attendance_status in ('present', 'late'))::int as attended,
      (select count(*) from public.syllabus_items si
        where si.grade_id = nxt.grade_id and si.track = nxt.target_track)::int as syllabus_total,
      (select count(*) from public.syllabus_items si
        join public.technique_sign_offs tso on tso.syllabus_item_id = si.id and tso.student_id = s.id
        where si.grade_id = nxt.grade_id and si.track = nxt.target_track)::int as syllabus_signed
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
      t.cycle_start <= t.today - make_interval(months => t.min_months), t.min_months > 0),
    (7::smallint, 'sessions', 'Training sessions since last grading', t.attended::text, t.min_sessions::text,
      t.attended >= t.min_sessions, t.min_sessions is not null),
    (8::smallint, 'techniques', 'Target-grade techniques signed off', t.syllabus_signed::text, t.syllabus_total::text,
      t.syllabus_signed = t.syllabus_total, t.syllabus_total > 0),
    (9::smallint, 'fees', 'Fees up to date', case when t.outstanding_fees then 'Outstanding' else 'Clear' end, 'Clear',
      not t.outstanding_fees, true)
  ) as v(sort, key, label, actual, required, met, applies)
  where v.applies
  order by v.sort;
$$;

revoke all on function public.student_grading_readiness(uuid) from public, anon, authenticated;
grant execute on function public.student_grading_readiness(uuid) to service_role;

commit;
