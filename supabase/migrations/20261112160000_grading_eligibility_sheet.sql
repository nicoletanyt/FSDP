-- Grading eligibility aligned with the published ASK sheets (children's 12th–2nd
-- Kyu; adult 6th Kyu–4th Dan, revised January 2021).
--
--  * Adult 2nd Kyu (Black) carries no age rule; the "at least 12" gate is on the
--    children's sheet only.
--  * Junior Dan is for candidates 14 and below (by year). Older 1st Kyu holders
--    skip it and target 1st Dan.
--  * Eligibility is computed once, in student_grading_readiness, so the invitation
--    list and the student's own checklist can never disagree.
begin;

alter table public.grade_requirements
  add column if not exists max_age_years smallint;

alter table public.grade_requirements
  drop constraint if exists grade_requirements_max_age_years_check;
alter table public.grade_requirements
  add constraint grade_requirements_max_age_years_check
  check (max_age_years is null or max_age_years >= coalesce(min_age_years, 0));

-- Every value straight from the sheets. Fees are left untouched.
update public.grade_requirements req
set min_months = sheet.min_months,
    max_months = sheet.max_months,
    min_sessions = sheet.min_sessions,
    min_age_years = sheet.min_age_years,
    max_age_years = sheet.max_age_years
from (values
  -- Children's grading
  ('red-12th-kyu',         'children'::public.grade_track,  3, null::smallint, null::smallint,    5::smallint, null::smallint),
  ('red-gold-11th-kyu',    'children'::public.grade_track,  4, null, null, null, null),
  ('yellow-10th-kyu',      'children'::public.grade_track,  4, null, null, null, null),
  ('orange-9th-kyu',       'children'::public.grade_track,  4, null, null, null, null),
  ('green-8th-kyu',        'children'::public.grade_track,  4,    6, null, null, null),
  ('purple-7th-kyu',       'children'::public.grade_track,  6, null, null, null, null),
  ('blue-6th-kyu',         'children'::public.grade_track,  6, null, null, null, null),
  ('blue-silver-6th-kyu',  'children'::public.grade_track,  6, null, null, null, null),
  ('blue-gold-5th-kyu',    'children'::public.grade_track,  6, null, null, null, null),
  ('brown-4th-kyu',        'children'::public.grade_track, 10, null, null, null, null),
  ('brown-silver-4th-kyu', 'children'::public.grade_track, 10, null, null, null, null),
  ('brown-gold-3rd-kyu',   'children'::public.grade_track,  8,   10, null, null, null),
  ('black-2nd-kyu',        'children'::public.grade_track, 10, null, null,   12, null),
  ('black-silver-2nd-kyu', 'children'::public.grade_track, 10, null, null, null, null),
  -- Adult grading
  ('blue-6th-kyu',         'adult'::public.grade_track,     3, null,   20, null, null),
  ('blue-gold-5th-kyu',    'adult'::public.grade_track,     0, null,   24, null, null),
  ('brown-4th-kyu',        'adult'::public.grade_track,     0, null,   32, null, null),
  ('brown-gold-3rd-kyu',   'adult'::public.grade_track,     6, null,   36, null, null),
  ('black-2nd-kyu',        'adult'::public.grade_track,     6, null,   56, null, null),
  ('black-gold-1st-kyu',   'adult'::public.grade_track,     9, null,   62, null, null),
  ('junior-dan',           'adult'::public.grade_track,     9, null,   62, null,   14),
  ('1st-dan',              'adult'::public.grade_track,     9, null,   70,   15, null),
  ('2nd-dan',              'adult'::public.grade_track,    18, null,  150, null, null),
  ('3rd-dan',              'adult'::public.grade_track,    30, null,  240, null, null),
  ('4th-dan',              'adult'::public.grade_track,    42, null,  400,   26, null)
) as sheet(grade_id, track, min_months, max_months, min_sessions, min_age_years, max_age_years)
where req.grade_id = sheet.grade_id and req.track = sheet.track;

comment on column public.grade_requirements.max_age_years is
  'Maximum calendar-year age for this grade (Junior Dan: 14). A student above it skips the grade when the next grade is chosen.';

-- One row per requirement for the student's next grade. A grade whose maximum
-- age the student has passed is skipped. Rows come back in display order.
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
      nxt.min_months, nxt.max_months, nxt.min_sessions, nxt.min_age_years, nxt.max_age_years,
      (extract(year from age(s.today, s.cycle_start)) * 12 + extract(month from age(s.today, s.cycle_start)))::int as grade_months,
      (extract(year from age(s.today, s.joined_at)) * 12 + extract(month from age(s.today, s.joined_at)))::int as member_months,
      (select count(*) from public.event_students es
        join public.events ce on ce.id = es.event_id
        where es.student_id = s.id and ce.event_type = 'class'
          and ce.starts_at::date >= s.cycle_start
          and es.attendance_status in ('present', 'late'))::int as attended,
      (select count(*) from public.syllabus_items si
        where si.grade_id = nxt.grade_id and si.track = s.grade_track)::int as syllabus_total,
      (select count(*) from public.syllabus_items si
        join public.technique_sign_offs tso on tso.syllabus_item_id = si.id and tso.student_id = s.id
        where si.grade_id = nxt.grade_id and si.track = s.grade_track)::int as syllabus_signed
    from student s
    join public.grades cur on cur.id = s.current_grade_id
    join lateral (
      select grade.id as grade_id, grade.label as grade_label, req.min_months, req.max_months,
        req.min_sessions, req.min_age_years, req.max_age_years
      from public.grades grade
      join public.grade_tracks gt on gt.grade_id = grade.id and gt.track = s.grade_track
      join public.grade_requirements req on req.grade_id = grade.id and req.track = s.grade_track
      where grade.sort_order > cur.sort_order
        and (req.max_age_years is null or s.age_years <= req.max_age_years)
      order by grade.sort_order
      limit 1
    ) nxt on true
  )
  select t.next_id, t.next_label, t.grade_track, v.sort, v.key, v.label, v.actual, v.required, coalesce(v.met, false)
  from target t
  cross join lateral (values
    (1::smallint, 'membership', 'Active membership', initcap(t.membership_status::text), 'Active',
      t.membership_status = 'active', true),
    (2::smallint, 'membership-length', 'Time as a member',
      t.member_months || case when t.member_months = 1 then ' month' else ' months' end, '3 months',
      t.joined_at <= t.today - interval '3 months', true),
    (3::smallint, 'age', 'Minimum age (by year)', t.age_years || ' years', t.min_age_years || ' years',
      t.age_years >= t.min_age_years, t.min_age_years is not null),
    (4::smallint, 'max-age', 'Maximum age (by year)', t.age_years || ' years', t.max_age_years || ' years',
      t.age_years <= t.max_age_years, t.max_age_years is not null),
    (5::smallint, 'time', case when t.current_ranked then 'Time in current grade' else 'Practice since joining' end,
      t.grade_months || case when t.grade_months = 1 then ' month' else ' months' end,
      case when t.max_months is null then t.min_months || ' months' else t.min_months || '–' || t.max_months || ' months' end,
      t.cycle_start <= t.today - make_interval(months => t.min_months), t.min_months > 0),
    (6::smallint, 'sessions', 'Training sessions since last grading', t.attended::text, t.min_sessions::text,
      t.attended >= t.min_sessions, t.min_sessions is not null),
    (7::smallint, 'techniques', 'Target-grade techniques signed off', t.syllabus_signed::text, t.syllabus_total::text,
      t.syllabus_signed = t.syllabus_total, t.syllabus_total > 0),
    (8::smallint, 'fees', 'Fees up to date', case when t.outstanding_fees then 'Outstanding' else 'Clear' end, 'Clear',
      not t.outstanding_fees, true)
  ) as v(sort, key, label, actual, required, met, applies)
  where v.applies
  order by v.sort;
$$;

revoke all on function public.student_grading_readiness(uuid) from public, anon, authenticated;
grant execute on function public.student_grading_readiness(uuid) to service_role;

-- Same event, window and application rules as before; every student rule now
-- comes from student_grading_readiness.
create or replace function public.eligible_grading_students(target_event uuid)
returns table(student_id uuid, user_id uuid, email text, target_grade_id text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.email, ready.target_grade_id
  from public.gradings gr
  join public.events e on e.id = gr.event_id
  join public.students s on s.membership_status = 'active' and not s.outstanding_fees
    and (s.home_centre_id = e.centre_id or gr.official_schedule)
    and s.user_id is not null
  join lateral (
    select r.target_grade_id, r.track
    from public.student_grading_readiness(s.id) r
    group by r.target_grade_id, r.track
    having bool_and(r.met)
  ) ready on ready.track = gr.track
  join public.grading_target_grades tgt on tgt.grading_event_id = e.id and tgt.grade_id = ready.target_grade_id
  where gr.event_id = target_event and gr.application_status = 'open'
    and e.status = 'scheduled'
    and (gr.grading_date is null and e.starts_at > now() or gr.grading_date > (now() at time zone 'Asia/Singapore')::date)
    and (gr.application_opens_on is null or gr.application_opens_on <= (now() at time zone 'Asia/Singapore')::date)
    and gr.application_deadline >= (now() at time zone 'Asia/Singapore')::date
    and not exists (select 1 from public.grading_applications a where a.student_id = s.id and a.grading_event_id = e.id);
$$;

revoke all on function public.eligible_grading_students(uuid) from public, anon, authenticated;
grant execute on function public.eligible_grading_students(uuid) to service_role;

-- The signed-in student's own checklist for their next grade.
create or replace function public.my_grading_readiness()
returns table(target_grade_id text, target_grade_label text, track public.grade_track,
  sort smallint, key text, label text, actual text, required text, met boolean)
language sql stable security definer set search_path = '' as $$
  select r.*
  from public.students s
  cross join lateral public.student_grading_readiness(s.id) r
  where s.user_id = (select auth.uid())
  order by r.sort;
$$;

revoke all on function public.my_grading_readiness() from public, anon;
grant execute on function public.my_grading_readiness() to authenticated;

commit;
