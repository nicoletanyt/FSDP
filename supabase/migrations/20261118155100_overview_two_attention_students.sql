-- Keep the full attention count; only shorten the Overview preview.
create or replace function public.admin_overview_recent_enrolments(target_centre uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  with overview as (
    select public.admin_overview(target_centre) as snapshot
  ), monitoring as (
    select public.admin_attendance_monitoring(target_centre) as students
  ), flagged as (
    select item from monitoring cross join lateral jsonb_array_elements(students) as item
    where item->>'level' in ('at_risk', 'critical')
  ), totals as (
    select count(*)::integer as attention_count,
      count(*) filter (where item->>'level' = 'critical')::integer as critical_count
    from flagged
  ), top_two as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.item->'id', 'first_name', f.item->'first_name',
      'last_name', f.item->'last_name', 'grade', f.item->'grade',
      'centre_id', s.home_centre_id, 'level', f.item->'level',
      'missed', f.item->'missed', 'enrolments', f.item->'enrolments',
      'notified', exists (
        select 1 from public.admin_attendance_email_sends n
        where n.student_id = s.id and n.status = 'accepted'
          and coalesce(n.completed_at, n.created_at) > now() - interval '30 days'
      )
    ) order by case when f.item->>'level' = 'critical' then 0 else 1 end,
      f.item->>'first_name', f.item->>'last_name'), '[]'::jsonb) as items
    from (select item from flagged order by
      case when item->>'level' = 'critical' then 0 else 1 end,
      item->>'first_name', item->>'last_name' limit 2) f
    join public.students s on s.id = (f.item->>'id')::uuid
  )
  select overview.snapshot || jsonb_build_object(
    'attention_count', totals.attention_count,
    'critical_count', totals.critical_count,
    'attention_students', top_two.items
  ) into result from overview cross join totals cross join top_two;
  return result;
end;
$$;
