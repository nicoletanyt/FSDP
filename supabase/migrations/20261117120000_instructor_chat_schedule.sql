-- The instructor calendar includes general grading events for its UI. DojoGPT
-- needs only the signed-in instructor's assigned events, scoped before paging.
create function public.instructor_chat_schedule(
  range_from timestamptz, range_to timestamptz,
  page_size integer default 20, page_offset integer default 0
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  owner uuid;
begin
  if public.current_user_role() is distinct from 'instructor'::public.user_role then
    raise exception 'Instructor access is required' using errcode = '42501';
  end if;
  owner := public.current_instructor_id();
  if range_from is null or range_to is null or range_to <= range_from
    or range_to - range_from > interval '62 days'
    or page_size is null or page_size not between 1 and 100
    or page_offset is null or page_offset < 0 then
    raise exception 'Invalid calendar range or pagination' using errcode = '22023';
  end if;

  return (
    with scoped as (
      select e.id,
        coalesce(e.starts_at, g.grading_date::timestamp at time zone 'Asia/Singapore') as sort_at,
        jsonb_build_object(
          'id', e.id, 'name', e.name, 'event_type', e.event_type,
          'instructor_id', e.instructor_id, 'status', e.status,
          'starts_at', case when g.event_id is not null and g.schedule_published_at is null
            and not public.can_view_grading_schedule(e.id) then null else e.starts_at end,
          'ends_at', case when g.event_id is not null and g.schedule_published_at is null
            and not public.can_view_grading_schedule(e.id) then null else e.ends_at end,
          'centre', jsonb_build_object('name', c.name),
          'grading', case when g.event_id is null then null else jsonb_build_object(
            'grading_date', g.grading_date,
            'application_deadline', g.application_deadline,
            'application_status', g.application_status,
            'reporting_release_on', g.reporting_release_on,
            'reporting_time', case when g.reporting_release_on <=
              (now() at time zone 'Asia/Singapore')::date then g.reporting_time else null end
          ) end
        ) as item
      from public.events e
      left join public.gradings g on g.event_id = e.id
      left join public.centres c on c.id = e.centre_id
      where owner is not null and e.instructor_id = owner
        and ((e.starts_at < range_to and e.ends_at > range_from)
          or (e.event_type = 'grading' and e.starts_at is null
            and g.grading_date::timestamp at time zone 'Asia/Singapore' < range_to
            and (g.grading_date + 1)::timestamp at time zone 'Asia/Singapore' > range_from))
    ), page as (
      select * from scoped order by sort_at, id limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(p.item order by p.sort_at, p.id) from page p), '[]'::jsonb),
      'total', (select count(*) from scoped), 'offset', page_offset, 'limit', page_size
    )
  );
end; $$;

revoke all on function public.instructor_chat_schedule(timestamptz,timestamptz,integer,integer) from public, anon, authenticated;
grant execute on function public.instructor_chat_schedule(timestamptz,timestamptz,integer,integer) to authenticated;
