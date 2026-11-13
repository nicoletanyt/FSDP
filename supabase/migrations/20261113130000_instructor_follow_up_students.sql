-- Students taught by the signed-in instructor in the last 90 days whose most recent
-- classes are consecutive absences. Used by DojoGPT for follow-up questions.
-- The streak matches instructor_student_summary.consecutiveAbsences: it counts
-- back from the newest ended, non-cancelled class and stops at any non-absent
-- record (unmarked included). Security invoker, so existing RLS still applies.
create or replace function public.instructor_follow_up_students(
  min_absences integer default 3, page_size integer default 20, page_offset integer default 0
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := public.require_current_instructor();
begin
  if min_absences is null or min_absences not between 1 and 20
     or page_size is null or page_size not between 1 and 100
     or page_offset is null or page_offset < 0 then
    raise exception 'Invalid follow-up request' using errcode = '22023';
  end if;
  return (
    with mine as (
      select distinct es.student_id
      from public.events e join public.event_students es on es.event_id = e.id
      where e.instructor_id = me and e.event_type = 'class' and e.status <> 'cancelled'
        and e.ends_at <= now() and e.ends_at > now() - interval '90 days'
    ), training as (
      select es.student_id, es.attendance_status, e.starts_at,
        row_number() over (partition by es.student_id order by e.starts_at desc, e.id desc) as position
      from mine
      join public.event_students es on es.student_id = mine.student_id
      join public.events e on e.id = es.event_id
      where e.event_type = 'class' and e.status <> 'cancelled' and e.ends_at <= now()
    ), streaks as (
      select t.student_id,
        coalesce(min(t.position) filter (where t.attendance_status is distinct from 'absent'), count(*) + 1) - 1 as consecutive_absences,
        max(t.starts_at) filter (where t.attendance_status in ('present', 'late')) as last_attended_at
      from training t
      group by t.student_id
    ), flagged as (
      select st.student_id, st.consecutive_absences, st.last_attended_at,
        s.member_no, s.first_name, s.last_name, g.label as grade
      from streaks st
      join public.students s on s.id = st.student_id
      left join public.grades g on g.id = s.current_grade_id
      where st.consecutive_absences >= min_absences
    ), page as (
      select * from flagged
      order by consecutive_absences desc, lower(last_name), lower(first_name), student_id
      limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'student_id', p.student_id, 'member_no', p.member_no,
          'first_name', p.first_name, 'last_name', p.last_name, 'grade', p.grade,
          'consecutive_absences', p.consecutive_absences,
          'last_attended_on', (p.last_attended_at at time zone 'Asia/Singapore')::date)
        order by p.consecutive_absences desc, lower(p.last_name), lower(p.first_name), p.student_id)
        from page p), '[]'::jsonb),
      'total', (select count(*) from flagged),
      'offset', page_offset,
      'limit', page_size
    )
  );
end;
$$;

revoke all on function public.instructor_follow_up_students(integer, integer, integer) from public, anon;
grant execute on function public.instructor_follow_up_students(integer, integer, integer) to authenticated;
