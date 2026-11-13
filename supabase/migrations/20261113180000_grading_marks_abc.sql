-- Grading checklists use a letter per technique (A, B or C) instead of a tick.
-- A cell may be blank in a draft; submitting requires every cell to be marked (PGB06),
-- except for candidates marked absent, whose cells can't be marked.
-- The letters are stored as given; nothing maps them to pass/fail.
-- There are no saved marks yet, so `checked` is replaced rather than converted.
-- grading_batch_document returns to_jsonb(result rows), so it now returns `grade`.
alter table public.grading_batch_results
  add column grade text check (grade in ('A', 'B', 'C'));
alter table public.grading_batch_results drop column checked;

-- Patch the save function's live definition. Each replacement must match exactly once.
do $migration$
declare
  def text := pg_get_functiondef('public.save_instructor_grading_batch(uuid,uuid,uuid,integer,jsonb,boolean,jsonb)'::regprocedure);
  pair text[];
  pairs text[][] := array[
    -- Each cell carries `grade`: 'A', 'B', 'C' or null (blank).
    array[$old$      or jsonb_typeof(cell->'checked') is distinct from 'boolean' then$old$,
          $new$      or not (cell ? 'grade') or jsonb_typeof(cell->'grade') not in ('string', 'null')
      or (cell->>'grade') not in ('A', 'B', 'C') then$new$],
    array[$old$'syllabus_item_id', value->>'syllabus_item_id', 'checked', (value->>'checked')::boolean)$old$,
          $new$'syllabus_item_id', value->>'syllabus_item_id', 'grade', value->'grade')$new$],
    -- Drafts may have blanks; a submission must mark every cell of every candidate not marked absent.
    array[$old$  if submit then
    if examiner_signature is null or$old$,
          $new$  if submit and exists (select 1 from jsonb_array_elements(normalized) x where x->>'grade' is null
      and not exists (select 1 from public.event_students es where es.event_id = session_row.grading_event_id
        and es.student_id = (x->>'student_id')::uuid and es.attendance_status = 'absent')) then
    raise exception 'Every technique needs A, B or C before submitting' using errcode = 'PGB06';
  end if;
  if submit then
    if examiner_signature is null or$new$],
    array[$old$  insert into public.grading_batch_results(batch_id, student_id, syllabus_item_id, checked)
    select selected.id, (value->>'student_id')::uuid, value->>'syllabus_item_id', (value->>'checked')::boolean
    from jsonb_array_elements(normalized)
    on conflict (batch_id, student_id, syllabus_item_id) do update set checked = excluded.checked;$old$,
          $new$  insert into public.grading_batch_results(batch_id, student_id, syllabus_item_id, grade)
    select selected.id, (value->>'student_id')::uuid, value->>'syllabus_item_id', value->>'grade'
    from jsonb_array_elements(normalized)
    on conflict (batch_id, student_id, syllabus_item_id) do update set grade = excluded.grade;$new$]
  ];
begin
  foreach pair slice 1 in array pairs loop
    if (length(def) - length(replace(def, pair[1], ''))) / length(pair[1]) <> 1 then
      raise exception 'save_instructor_grading_batch: expected exactly one match for %', left(pair[1], 60);
    end if;
    def := replace(def, pair[1], pair[2]);
  end loop;
  if position('checked' in def) > 0 then
    raise exception 'save_instructor_grading_batch: a reference to checked remains';
  end if;
  execute def;
end;
$migration$;
