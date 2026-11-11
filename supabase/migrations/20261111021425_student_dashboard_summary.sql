-- One read for the member dashboard: current and next belt, progress towards
-- the next grading, attendance, bookings and grading status for the signed-in
-- student. It reuses the grading rules from eligible_grading_students (track by
-- age this calendar year, next grade by grade_tracks, sessions = class events
-- attended since the last grading) so the dashboard and grading page agree.
create or replace function public.student_dashboard_summary()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select s.id, s.membership_status, s.current_grade_id,
      coalesce(s.last_graded_at, s.joined_at) as rank_since,
      (now() at time zone 'Asia/Singapore')::date as today,
      case when extract(year from now() at time zone 'Asia/Singapore') - extract(year from s.date_of_birth) >= 13
        then 'adult'::public.grade_track else 'children'::public.grade_track end as track
    from public.students s
    where s.user_id = (select auth.uid())
      and (select public.current_user_role()) = 'student'
  ), current_grade as (
    select g.id, g.label, g.colour, g.sort_order
    from me join public.grades g on g.id = me.current_grade_id
  ), next_grade as (
    select g.id, g.label, g.colour, r.min_sessions, r.min_months, r.min_age_years, r.fee_cents
    from me
    join public.grade_tracks gt on gt.track = me.track
    join public.grades g on g.id = gt.grade_id
      and g.sort_order > coalesce((select sort_order from current_grade), -1)
    left join public.grade_requirements r on r.grade_id = g.id and r.track = me.track
    order by g.sort_order
    limit 1
  ), classes as (
    select e.id, e.name, e.starts_at, e.status, e.centre_id, e.instructor_id, es.attendance_status
    from me
    join public.event_students es on es.student_id = me.id
    join public.events e on e.id = es.event_id and e.event_type = 'class'
  ), next_class as (
    select c.starts_at, coalesce(t.label, c.name) as title, ce.name as centre,
      nullif(concat_ws(' ', i.first_name, i.last_name), '') as instructor
    from classes c
    join public.centres ce on ce.id = c.centre_id
    left join public.classes cl on cl.event_id = c.id
    left join public.class_types t on t.id = cl.class_type_id
    left join public.instructors i on i.id = c.instructor_id
    where c.status = 'scheduled' and c.starts_at > now()
    order by c.starts_at
    limit 1
  ), gradings as (
    select o.applied from public.my_grading_opportunities() o
  )
  select coalesce((
    select jsonb_build_object(
      'linked', true,
      'membership_status', me.membership_status,
      'track', me.track,
      'belt', (select jsonb_build_object('id', id, 'label', label, 'colour', colour) from current_grade),
      'next_belt', (select jsonb_build_object('id', id, 'label', label, 'colour', colour) from next_grade),
      'requirements', jsonb_build_object(
        'sessions_done', (select count(*) from classes c
          where c.starts_at::date >= me.rank_since and c.attendance_status in ('present', 'late')),
        'sessions_required', (select min_sessions from next_grade),
        'months_done', (extract(year from age(me.today, me.rank_since)) * 12
          + extract(month from age(me.today, me.rank_since)))::int,
        'months_required', (select min_months from next_grade),
        'min_age_years', (select min_age_years from next_grade),
        'fee_cents', (select fee_cents from next_grade),
        -- A grading application only exists once its fee has been paid.
        'fee_paid', exists(select 1 from gradings where applied)
      ),
      'counts', jsonb_build_object(
        'classes_booked', (select count(*) from classes c where c.status = 'scheduled' and c.starts_at > now()),
        'sessions_marked', (select count(*) from classes c where c.attendance_status is not null),
        'sessions_attended', (select count(*) from classes c where c.attendance_status in ('present', 'late')),
        'gradings_open', (select count(*) from gradings where not applied)
      ),
      'next_class', (select to_jsonb(n) from next_class n)
    )
    from me
  ), jsonb_build_object('linked', false));
$$;

revoke all on function public.student_dashboard_summary() from public, anon;
grant execute on function public.student_dashboard_summary() to authenticated;
