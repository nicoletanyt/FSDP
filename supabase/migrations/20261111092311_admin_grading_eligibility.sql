-- Read-only administrator list: the same open events and eligibility function
-- used by send-grading-invitation, with live values for the detail drawer.
create function public.admin_grading_eligibility(target_event uuid default null)
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
    'sessions_attended', attended.total, 'techniques', techniques.items
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
  ) attended
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', si.id, 'label', si.label, 'category', si.category,
      'signed', tso.student_id is not null
    ) order by si.category, si.sort_order, si.id), '[]'::jsonb) as items
    from public.syllabus_items si
    left join public.technique_sign_offs tso on tso.student_id = s.id and tso.syllabus_item_id = si.id
    where si.grade_id = candidate.target_grade_id and si.track = candidate.track
  ) techniques;
  return result;
end;
$$;

revoke all on function public.admin_grading_eligibility(uuid) from public, anon;
grant execute on function public.admin_grading_eligibility(uuid) to authenticated;
