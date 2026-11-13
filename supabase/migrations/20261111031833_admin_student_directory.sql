-- Live student directory. Eligibility uses the same open official grading
-- events as the Overview; attendance risk uses Monitoring's last-five rule.
create function public.admin_student_directory(target_centre uuid default null)
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

  with monitored as (
    select public.admin_attendance_monitoring(target_centre) as students
  ), open_gradings as (
    select gr.event_id from public.gradings gr join public.events e on e.id = gr.event_id
    where gr.official_schedule and gr.application_status = 'open' and e.status = 'scheduled'
      and gr.grading_date > today_sgt and gr.application_opens_on <= today_sgt
      and gr.application_deadline >= today_sgt
  ), eligible as (
    select distinct eg.student_id
    from open_gradings gr cross join lateral public.eligible_grading_students(gr.event_id) eg
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'member_no', s.member_no, 'first_name', s.first_name,
    'last_name', s.last_name, 'email', s.email, 'date_of_birth', s.date_of_birth,
    'home_centre_id', s.home_centre_id, 'centre_name', c.name,
    'grade', g.label, 'membership_status', s.membership_status,
    'risk_level', m.item->>'level', 'attendance_rate', m.item->'rate',
    'attended', m.item->'attended', 'missed', m.item->'missed',
    'enrolments', m.item->'enrolments', 'last_attended', m.item->'last_attended',
    'grading_status', case when exists (select 1 from eligible eg where eg.student_id = s.id)
      then 'eligible' when exists (select 1 from open_gradings) then 'not_eligible'
      else 'no_open_gradings' end
  ) order by s.first_name, s.last_name, s.id), '[]'::jsonb)
  into result
  from monitored cross join lateral jsonb_array_elements(monitored.students) as m(item)
  join public.students s on s.id = (m.item->>'id')::uuid
  join public.centres c on c.id = s.home_centre_id
  join public.grades g on g.id = s.current_grade_id;
  return result;
end;
$$;

revoke all on function public.admin_student_directory(uuid) from public, anon;
grant execute on function public.admin_student_directory(uuid) to authenticated;
