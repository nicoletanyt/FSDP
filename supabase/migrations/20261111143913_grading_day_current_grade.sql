begin;

-- Candidates' current grade is returned as a full grade (not just its label)
-- so the grading day page can show it with the shared grade badge.
create or replace function public.examiner_grading_day(target_event uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := (select public.current_instructor_id());
  result jsonb;
begin
  if not exists (select 1 from public.gradings where event_id = target_event) then
    raise exception 'Grading session not found' using errcode = '22023';
  end if;
  if not ((select public.is_administrator()) or public.is_on_grading_panel(target_event)) then
    raise exception 'Only examiners on this grading''s panel can grade it' using errcode = 'PGP01';
  end if;
  select jsonb_build_object(
    'event_id', e.id, 'name', e.name, 'status', e.status, 'track', g.track,
    'grading_date', coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date),
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'reporting_time', g.reporting_time,
    'centre', jsonb_build_object('name', c.name, 'address', c.address),
    'is_chief', coalesce((select m.is_chief from public.grading_panel_members m
      where m.grading_event_id = e.id and m.instructor_id = me), false),
    'panel', (select coalesce(jsonb_agg(jsonb_build_object(
        'instructor_id', p.instructor_id, 'name', trim(i.first_name || ' ' || i.last_name), 'is_chief', p.is_chief)
        order by p.is_chief desc, p.added_at, p.instructor_id), '[]'::jsonb)
      from public.grading_panel_members p join public.instructors i on i.id = p.instructor_id
      where p.grading_event_id = e.id),
    'grades', (select coalesce(jsonb_agg(jsonb_build_object(
        'grade', jsonb_build_object('id', gr.id, 'label', gr.label, 'colour', gr.colour,
          'is_ranked', gr.is_ranked, 'sort_order', gr.sort_order),
        'starts_at', t.starts_at, 'ends_at', t.ends_at,
        'candidates', (select coalesce(jsonb_agg(jsonb_build_object(
            'student_id', s.id, 'name', coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.email),
            'member_no', s.member_no, 'candidate_number', es.candidate_number,
            'current_grade', (select jsonb_build_object('id', cg.id, 'label', cg.label, 'colour', cg.colour,
                'is_ranked', cg.is_ranked, 'sort_order', cg.sort_order)
              from public.grades cg where cg.id = s.current_grade_id))
            order by es.candidate_number nulls last, s.last_name, s.first_name, s.id), '[]'::jsonb)
          from public.grading_applications ga
          join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id
          join public.students s on s.id = ga.student_id
          where ga.grading_event_id = e.id and ga.target_grade_id = gr.id and ga.status <> 'withdrawn'),
        'my_batch', (select jsonb_build_object('status', b.status, 'version', b.version,
            'updated_at', b.updated_at, 'submitted_at', b.submitted_at)
          from public.grading_batches b
          where b.event_id = e.id and b.instructor_id = me and b.target_grade_id = gr.id)
      ) order by t.starts_at nulls last, gr.sort_order, gr.id), '[]'::jsonb)
      from public.grading_target_grades t join public.grades gr on gr.id = t.grade_id
      where t.grading_event_id = e.id)
  ) into result
  from public.gradings g join public.events e on e.id = g.event_id join public.centres c on c.id = e.centre_id
  where g.event_id = target_event;
  return result;
end;
$$;
revoke all on function public.examiner_grading_day(uuid) from public, anon;

commit;
