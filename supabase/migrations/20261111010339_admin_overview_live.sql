-- One admin-only, aggregated snapshot for the Overview. Do not expose student
-- contact details or pretend email send counts are unique students reached.
create function public.admin_overview(target_centre uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today_sgt date := (now() at time zone 'Asia/Singapore')::date;
  summary jsonb;
begin
  if auth.uid() is null or not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_centre is not null and not exists (select 1 from public.centres where id = target_centre) then
    raise exception 'Centre not found' using errcode = '22023';
  end if;

  with scoped_students as (
    select s.id, s.first_name, s.last_name, s.home_centre_id, s.joined_at,
      s.membership_status, coalesce(g.label, s.current_grade_id) as grade
    from public.students s left join public.grades g on g.id = s.current_grade_id
    where target_centre is null or s.home_centre_id = target_centre
  ),
  -- All completed, scheduled class bookings matter for a consecutive-absence
  -- streak. A cancelled or future class must never count as a missed booking.
  bookings as (
    select es.student_id, es.attendance_status,
      (e.starts_at at time zone 'Asia/Singapore')::date as day, e.starts_at, e.id as event_id
    from public.event_students es join scoped_students s on s.id = es.student_id
    join public.events e on e.id = es.event_id
    where e.event_type = 'class' and e.status = 'scheduled' and e.ends_at <= now()
  ),
  ranked_bookings as (
    select b.*,
      coalesce(sum(case when b.attendance_status is distinct from 'absent' then 1 else 0 end)
        over (partition by b.student_id order by b.starts_at desc, b.event_id desc
          rows between unbounded preceding and 1 preceding), 0) as breaks_before
    from bookings b
  ),
  streaks as (
    select student_id, count(*)::integer as missed
    from ranked_bookings where attendance_status = 'absent' and breaks_before = 0
    group by student_id
  ),
  risk as (
    select s.*, coalesce(st.missed, 0) as consecutive,
      (s.joined_at < today_sgt - 29 and not exists (
        select 1 from bookings b where b.student_id = s.id and b.day >= today_sgt - 29
      )) as no_recent
    from scoped_students s left join streaks st on st.student_id = s.id
  ),
  risk_counts as (
    select count(*)::integer as total,
      count(*) filter (where membership_status = 'active')::integer as active,
      count(*) filter (where consecutive >= 2 or no_recent)::integer as attention,
      count(*) filter (where consecutive >= 5)::integer as critical
    from risk
  ),
  attention_list as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'first_name', first_name, 'last_name', last_name,
      'centre_id', home_centre_id, 'grade', grade,
      'level', case when consecutive >= 5 then 'critical' else 'at_risk' end,
      'no_recent', no_recent, 'consecutive', consecutive
    ) order by case when consecutive >= 5 then 0 else 1 end, first_name, last_name), '[]'::jsonb) as items
    from (select * from risk where consecutive >= 2 or no_recent
      order by case when consecutive >= 5 then 0 else 1 end, first_name, last_name limit 5) top_five
  ),
  -- Trend is based on completed classes, not on future bookings or unmarked
  -- attendance. Excused/unmarked bookings do not enter the rate denominator.
  completed_sessions as (
    select e.id, (e.starts_at at time zone 'Asia/Singapore')::date as day
    from public.events e where e.event_type = 'class' and e.status = 'scheduled'
      and (target_centre is null or e.centre_id = target_centre)
      and e.starts_at >= (today_sgt - 83)::timestamp at time zone 'Asia/Singapore'
      and e.ends_at <= now()
  ),
  session_totals as (
    select c.day, c.id,
      count(*) filter (where es.attendance_status in ('present', 'late'))::integer as attended,
      count(*) filter (where es.attendance_status = 'absent')::integer as absent
    from completed_sessions c left join public.event_students es on es.event_id = c.id
    group by c.day, c.id
  ),
  trend as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(w.week_start, 'DD Mon'), 'sessions', coalesce(x.sessions, 0),
      'rate', case when coalesce(x.attended, 0) + coalesce(x.absent, 0) = 0 then 0
        else round(100.0 * x.attended / (x.attended + x.absent))::integer end
    ) order by w.week_start), '[]'::jsonb) as points
    from (select today_sgt - (week * 7 + 6) as week_start,
        today_sgt - week * 7 as week_end from generate_series(11, 0, -1) week) w
    cross join lateral (
      select count(*)::integer as sessions, coalesce(sum(attended), 0)::integer as attended,
        coalesce(sum(absent), 0)::integer as absent
      from session_totals where day between w.week_start and w.week_end
    ) x
  ),
  open_gradings as (
    select gr.event_id from public.gradings gr join public.events e on e.id = gr.event_id
    where gr.official_schedule and gr.application_status = 'open' and e.status = 'scheduled'
      and gr.grading_date > today_sgt and gr.application_opens_on <= today_sgt
      and gr.application_deadline >= today_sgt
  ),
  eligible as (
    select count(distinct eg.student_id)::integer as count
    from open_gradings gr cross join lateral public.eligible_grading_students(gr.event_id) eg
    join scoped_students s on s.id = eg.student_id
  ),
  applications as (
    select count(*)::integer as count from public.grading_applications a
    join scoped_students s on s.id = a.student_id
  ),
  sends as (
    select coalesce(sum(recipient_count), 0)::integer as recipients
    from public.grading_email_sends where status = 'accepted'
  )
  select jsonb_build_object(
    'active_students', rc.active, 'total_students', rc.total,
    'attention_count', rc.attention, 'critical_count', rc.critical,
    'attention_students', al.items, 'trend', t.points,
    'eligible_count', el.count, 'application_count', a.count,
    'open_gradings', (select count(*)::integer from open_gradings),
    'invitation_recipients', se.recipients
  ) into summary
  from risk_counts rc cross join attention_list al cross join trend t
    cross join eligible el cross join applications a cross join sends se;
  return summary;
end;
$$;

revoke all on function public.admin_overview(uuid) from public, anon;
grant execute on function public.admin_overview(uuid) to authenticated;
