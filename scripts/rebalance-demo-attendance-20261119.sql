-- One-time demo-data correction: leave four synthetic and four other demo
-- students at risk. Keep the five-booking/three-miss rule unchanged and never
-- touch real students, future classes, check-ins or non-absence results.
begin;

do $$
declare
  risk_total integer;
  demo_risk integer;
  synthetic_risk integer;
  updated_rows integer;
  remaining_risk integer;
begin
  with recent as (
    select s.id as student_id, s.email, es.attendance_status,
      row_number() over (partition by s.id order by e.starts_at desc, e.id desc) as booking_rank
    from public.students s
    join public.event_students es on es.student_id = s.id
    join public.events e on e.id = es.event_id
    where e.event_type = 'class' and e.status in ('scheduled', 'completed') and e.ends_at <= now()
  ), at_risk as (
    select student_id, max(email) as email from recent
    where booking_rank <= 5 group by student_id
    having count(*) filter (where attendance_status = 'absent') >= 3
  )
  select count(*), count(*) filter (where email like '%@example.test'),
    count(*) filter (where email like 'synthetic.%@example.test')
    into risk_total, demo_risk, synthetic_risk from at_risk;

  if risk_total <> 81 or demo_risk <> 81 or synthetic_risk <> 55 then
    raise exception 'Demo risk cohort changed (%, %, %); refusing to alter attendance',
      risk_total, demo_risk, synthetic_risk;
  end if;

  with recent as (
    select s.id as student_id, s.email, es.event_id, es.attendance_status,
      es.checked_in_at, e.starts_at,
      row_number() over (partition by s.id order by e.starts_at desc, e.id desc) as booking_rank
    from public.students s
    join public.event_students es on es.student_id = s.id
    join public.events e on e.id = es.event_id
    where s.email like '%@example.test' and e.event_type = 'class'
      and e.status in ('scheduled', 'completed') and e.ends_at <= now()
  ), missed as (
    select *, count(*) over (partition by student_id) as missed,
      row_number() over (partition by student_id order by starts_at, event_id) as absence_rank
    from recent where booking_rank <= 5 and attendance_status = 'absent'
  ), at_risk as (
    select student_id, max(email) as email, max(missed) as missed
    from missed group by student_id having max(missed) >= 3
  ), retained as (
    select student_id from (
      select student_id, row_number() over (
        partition by case when email like 'synthetic.%@example.test' then 'synthetic' else 'other' end
        order by missed desc, student_id
      ) as priority from at_risk
    ) ranked where priority <= 4
  ), changes as (
    select m.student_id, m.event_id from missed m
    join at_risk r using (student_id)
    left join retained k using (student_id)
    where k.student_id is null and m.absence_rank <= m.missed - 2
      and m.checked_in_at is null
  )
  update public.event_students es set attendance_status = 'excused'
  from changes c where es.student_id = c.student_id and es.event_id = c.event_id
    and es.attendance_status = 'absent' and es.checked_in_at is null;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 109 then
    raise exception 'Expected 109 demo absences to become excused; updated %', updated_rows;
  end if;

  with recent as (
    select s.id as student_id, es.attendance_status,
      row_number() over (partition by s.id order by e.starts_at desc, e.id desc) as booking_rank
    from public.students s
    join public.event_students es on es.student_id = s.id
    join public.events e on e.id = es.event_id
    where e.event_type = 'class' and e.status in ('scheduled', 'completed') and e.ends_at <= now()
  ), at_risk as (
    select student_id from recent where booking_rank <= 5 group by student_id
    having count(*) filter (where attendance_status = 'absent') >= 3
  ) select count(*) into remaining_risk from at_risk;

  if remaining_risk <> 8 then
    raise exception 'Expected 8 at-risk students after rebalance; found %', remaining_risk;
  end if;
end;
$$;

commit;
