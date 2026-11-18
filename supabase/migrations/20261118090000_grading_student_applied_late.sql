-- Admins and examiners see when each candidate applied and whether it was after
-- the application deadline. Late is derived from the application's own submitted_at
-- (the Stripe webhook inserts the row when payment clears), because
-- grading_checkout_attempts is readable only by the student.
--
-- Patched from the live definition with exact replacements; the migration fails
-- rather than silently doing nothing if a definition differs.
do $migration$
declare
  def text := pg_get_functiondef('public.examiner_grading_day(uuid)'::regprocedure);
  pair text[];
  pairs text[][] := array[
    array[$old$es.candidate_number, s.current_grade_id,$old$,
          $new$es.candidate_number, s.current_grade_id, ga.submitted_at as applied_at,
      (g.application_deadline is not null
        and (ga.submitted_at at time zone 'Asia/Singapore')::date > g.application_deadline) as late,$new$],
    array[$old$left join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id$old$,
          $new$join public.gradings g on g.event_id = ga.grading_event_id
    left join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id$new$],
    array[$old$'session_id', case when visible then a.session_id end)$old$,
          $new$'session_id', case when visible then a.session_id end,
        'applied_at', a.applied_at, 'late', a.late)$new$]
  ];
begin
  foreach pair slice 1 in array pairs loop
    if (length(def) - length(replace(def, pair[1], ''))) <> length(pair[1]) then
      raise exception 'examiner_grading_day: expected exactly one match for %', left(pair[1], 60);
    end if;
    def := replace(def, pair[1], pair[2]);
  end loop;
  execute def;
end;
$migration$;

notify pgrst, 'reload schema';
