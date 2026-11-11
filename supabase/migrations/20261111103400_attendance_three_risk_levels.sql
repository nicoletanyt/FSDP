-- Keep the existing five-enrolment rule, but fold four or more missed
-- classes into At risk instead of exposing a separate Critical level.
create or replace function public.admin_attendance_monitoring(target_centre uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
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
      s.home_centre_id, c.name as centre_name, s.follow_up_status,
      coalesce(g.label, s.current_grade_id) as grade
    from public.students s
    join public.centres c on c.id = s.home_centre_id
    left join public.grades g on g.id = s.current_grade_id
    where target_centre is null or s.home_centre_id = target_centre
  ),
  completed_bookings as (
    select es.student_id, es.attendance_status, e.id as event_id,
      (e.starts_at at time zone 'Asia/Singapore')::date as day,
      row_number() over (partition by es.student_id order by e.starts_at desc, e.id desc) as booking_rank
    from public.event_students es
    join students_scoped s on s.id = es.student_id
    join public.events e on e.id = es.event_id
    where e.event_type = 'class' and e.status = 'scheduled' and e.ends_at <= now()
  ),
  metrics as (
    select s.id, s.first_name, s.last_name, s.member_no, s.email,
      s.home_centre_id, s.centre_name, s.follow_up_status, s.grade,
      count(b.event_id) filter (where b.booking_rank <= 5)::integer as enrolments,
      count(b.event_id) filter (where b.booking_rank <= 5 and b.attendance_status in ('present','late'))::integer as attended,
      count(b.event_id) filter (where b.booking_rank <= 5 and b.attendance_status = 'absent')::integer as missed,
      max(b.day) filter (where b.attendance_status in ('present','late')) as last_attended
    from students_scoped s left join completed_bookings b on b.student_id = s.id
    group by s.id, s.first_name, s.last_name, s.member_no, s.email,
      s.home_centre_id, s.centre_name, s.follow_up_status, s.grade
  ),
  outcomes as (
    select m.*, case when m.attended + m.missed = 0 then 'unassessed'
      when m.missed >= 2 then 'at_risk' else 'healthy' end as level,
      case when m.attended + m.missed = 0 then null
        else round(100.0 * m.attended / (m.attended + m.missed))::integer end as rate
    from metrics m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'first_name', first_name, 'last_name', last_name,
    'member_no', member_no, 'email', email, 'centre_name', centre_name,
    'grade', grade, 'follow_up_status', follow_up_status,
    'level', level, 'enrolments', enrolments, 'attended', attended,
    'missed', missed, 'rate', rate, 'last_attended', last_attended
  ) order by case level when 'at_risk' then 0 when 'healthy' then 1 else 2 end,
    rate nulls last, first_name, last_name), '[]'::jsonb)
  into result from outcomes;
  return result;
end;
$$;
