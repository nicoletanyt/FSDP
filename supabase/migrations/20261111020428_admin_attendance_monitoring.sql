-- Aggregate completed class bookings server-side; expose only to administrators.
create function public.admin_attendance_monitoring(target_centre uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today_sgt date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  if auth.uid() is null or not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_centre is not null and not exists (select 1 from public.centres where id = target_centre) then
    raise exception 'Centre not found' using errcode = '22023';
  end if;

  with students_scoped as (
    select s.id, s.first_name, s.last_name, s.member_no, s.email,
      s.home_centre_id, c.name as centre_name, s.joined_at, s.follow_up_status,
      coalesce(g.label, s.current_grade_id) as grade
    from public.students s
    join public.centres c on c.id = s.home_centre_id
    left join public.grades g on g.id = s.current_grade_id
    where target_centre is null or s.home_centre_id = target_centre
  ),
  bookings as (
    select es.student_id, es.attendance_status, e.id as event_id, e.starts_at,
      (e.starts_at at time zone 'Asia/Singapore')::date as day
    from public.event_students es
    join students_scoped s on s.id = es.student_id
    join public.events e on e.id = es.event_id
    where e.event_type = 'class' and e.status = 'scheduled' and e.ends_at <= now()
  ),
  ranked as (
    select b.*,
      coalesce(sum(case when b.attendance_status is distinct from 'absent' then 1 else 0 end)
        over (partition by b.student_id order by b.starts_at desc, b.event_id desc
          rows between unbounded preceding and 1 preceding), 0) as breaks_before
    from bookings b
  ),
  streaks as (
    select student_id, count(*)::integer as consecutive
    from ranked where attendance_status = 'absent' and breaks_before = 0
    group by student_id
  ),
  metrics as (
    select s.*,
      coalesce(st.consecutive, 0) as consecutive,
      count(b.event_id) filter (where b.day >= today_sgt - 29)::integer as recent_bookings,
      max(b.day) filter (where b.attendance_status in ('present','late')) as last_attended,
      count(b.event_id) filter (where b.day >= today_sgt - 29 and b.attendance_status in ('present','late'))::integer as attended_30,
      count(b.event_id) filter (where b.day >= today_sgt - 29 and b.attendance_status = 'absent')::integer as absent_30,
      count(b.event_id) filter (where b.day between today_sgt - 59 and today_sgt - 30 and b.attendance_status in ('present','late'))::integer as attended_previous,
      count(b.event_id) filter (where b.day between today_sgt - 59 and today_sgt - 30 and b.attendance_status = 'absent')::integer as absent_previous
    from students_scoped s left join bookings b on b.student_id = s.id
    left join streaks st on st.student_id = s.id
    group by s.id, s.first_name, s.last_name, s.member_no, s.email,
      s.home_centre_id, s.centre_name, s.joined_at, s.follow_up_status, s.grade, st.consecutive
  ),
  rates as (
    select m.*,
      m.joined_at < today_sgt - 29 and m.recent_bookings = 0 as no_recent,
      coalesce(round(100.0 * m.attended_30 / nullif(m.attended_30 + m.absent_30, 0), 1), 0) as rate_30,
      coalesce(round(100.0 * m.attended_previous / nullif(m.attended_previous + m.absent_previous, 0), 1), 0) as rate_previous
    from metrics m
  ),
  snapshots as (
    select r.*,
      (select coalesce(jsonb_agg(coalesce(round(100.0 *
        count_rates.attended / nullif(count_rates.attended + count_rates.absent, 0)), 0)
        order by weeks.week_number desc), '[]'::jsonb)
       from generate_series(7, 0, -1) as weeks(week_number)
       cross join lateral (
         select count(*) filter (where b.attendance_status in ('present','late'))::integer as attended,
           count(*) filter (where b.attendance_status = 'absent')::integer as absent
         from bookings b where b.student_id = r.id
           and b.day between today_sgt - (weeks.week_number * 7 + 6) and today_sgt - weeks.week_number * 7
       ) count_rates) as weekly_rates
    from rates r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'first_name', first_name, 'last_name', last_name,
    'member_no', member_no, 'email', email, 'centre_name', centre_name,
    'grade', grade, 'follow_up_status', follow_up_status,
    'level', case when consecutive >= 5 then 'critical'
      when consecutive >= 2 or no_recent then 'at_risk' else 'healthy' end,
    'no_recent', no_recent, 'consecutive', consecutive,
    'rate_30', rate_30, 'change', rate_30 - rate_previous,
    'last_attended', last_attended, 'weekly_rates', weekly_rates
  ) order by case when consecutive >= 5 then 0
    when consecutive >= 2 or no_recent then 1 else 2 end, rate_30, first_name, last_name), '[]'::jsonb)
  into result from snapshots;
  return result;
end;
$$;

revoke all on function public.admin_attendance_monitoring(uuid) from public, anon;
grant execute on function public.admin_attendance_monitoring(uuid) to authenticated;
