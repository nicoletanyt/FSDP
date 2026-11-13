-- Add the current report's actual author to the existing read-only report RPC.
-- Keep its signature, ownership checks, previous-feedback scope and ACLs.
begin;
create or replace function public.instructor_event_reports(target_event uuid, page_size integer default 50, page_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare session_start timestamptz;
begin
  perform public.require_current_instructor();
  if not public.instructor_teaches_event(target_event) then
    raise exception 'Event is unavailable' using errcode = '42501';
  end if;
  if page_size is null or page_size not between 1 and 100 or page_offset is null or page_offset < 0 then
    raise exception 'Invalid report pagination' using errcode = '22023';
  end if;
  select starts_at into session_start from public.events where id = target_event and event_type = 'class';
  if not found then raise exception 'A class event is required' using errcode = '22023'; end if;
  return (
    with roster as (
      select es, s, g, c, author from public.event_students es
      join public.students s on s.id = es.student_id
      left join public.grades g on g.id = s.current_grade_id
      left join public.centres c on c.id = s.home_centre_id
      left join public.instructors author on author.id = es.report_author_id
      where es.event_id = target_event
    ), page as (
      select * from roster order by lower((s).last_name), lower((s).first_name), (s).id
      limit page_size offset page_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'record', to_jsonb(p.es), 'student', to_jsonb(p.s) || jsonb_build_object('grade', to_jsonb(p.g), 'centre', to_jsonb(p.c)),
        'reportAuthor', to_jsonb(p.author),
        'previousReports', coalesce((select jsonb_agg(pr.entry order by pr.starts_at desc, pr.id desc) from (
          select previous_event.starts_at, previous_event.id,
            jsonb_build_object('record', to_jsonb(previous_record), 'event', to_jsonb(previous_event),
              'centre', to_jsonb(previous_centre), 'instructor', to_jsonb(previous_instructor),
              'reportAuthor', to_jsonb(previous_author), 'targetGrade', null, 'grading', null) as entry
          from public.event_students previous_record
          join public.events previous_event on previous_event.id = previous_record.event_id
          left join public.centres previous_centre on previous_centre.id = previous_event.centre_id
          left join public.instructors previous_instructor on previous_instructor.id = previous_event.instructor_id
          left join public.instructors previous_author on previous_author.id = previous_record.report_author_id
          where previous_record.student_id = (p.s).id and previous_event.event_type = 'class'
            and previous_event.starts_at < session_start and previous_event.starts_at <= now()
            and nullif(btrim(previous_record.report), '') is not null
          order by previous_event.starts_at desc, previous_event.id desc limit 2
        ) pr), '[]'::jsonb)
      ) order by lower((p.s).last_name), lower((p.s).first_name), (p.s).id) from page p), '[]'::jsonb),
      'total', (select count(*) from roster), 'offset', page_offset, 'limit', page_size
    )
  );
end;
$$;
commit;
