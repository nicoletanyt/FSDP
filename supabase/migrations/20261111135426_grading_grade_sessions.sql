begin;

create or replace function public.save_instructor_grading_batch(
  request_id uuid, expected_user uuid, target_event uuid, target_track public.grade_track,
  target_grade text, expected_version integer, cells jsonb, submit boolean default false, examiner_signature jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  selected public.grading_batches%rowtype;
  receipt public.grading_batch_write_requests%rowtype;
  payload jsonb;
  response jsonb;
  normalized jsonb;
  cell jsonb;
  stroke jsonb;
  point jsonb;
  session_row public.events%rowtype;
  expected_cells bigint;
begin
  if auth.uid() is null or expected_user is distinct from auth.uid() then
    raise exception 'The grading account changed' using errcode = '42501';
  end if;
  owner := public.current_instructor_id();
  if owner is null then raise exception 'A linked instructor is required' using errcode = '42501'; end if;
  select * into session_row from public.events where id = target_event for update;
  if not found or session_row.event_type <> 'grading' then
    raise exception 'Grading session not found' using errcode = '42501';
  end if;
  if request_id is null or target_track is null or target_grade is null or expected_version is null
    or expected_version < 0 or submit is null or cells is null or jsonb_typeof(cells) <> 'array'
    or jsonb_array_length(cells) not between 1 and 100000 or pg_column_size(cells) > 16000000 then
    raise exception 'Invalid grading batch request' using errcode = '22023';
  end if;
  for cell in select value from jsonb_array_elements(cells) loop
    if jsonb_typeof(cell) <> 'object' or jsonb_typeof(cell->'student_id') is distinct from 'string'
      or jsonb_typeof(cell->'syllabus_item_id') is distinct from 'string'
      or jsonb_typeof(cell->'checked') is distinct from 'boolean' then
      raise exception 'Invalid grading cell' using errcode = '22023';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('student_id', (value->>'student_id')::uuid,
    'syllabus_item_id', value->>'syllabus_item_id', 'checked', (value->>'checked')::boolean)
    order by (value->>'student_id')::uuid, value->>'syllabus_item_id') into normalized from jsonb_array_elements(cells);
  if (select count(distinct (value->>'student_id', value->>'syllabus_item_id')) from jsonb_array_elements(normalized))
    <> jsonb_array_length(normalized) then raise exception 'Duplicate grading cells' using errcode = '22023'; end if;
  payload := jsonb_build_object('event',target_event,'track',target_track,'grade',target_grade,
    'version',expected_version,'cells',normalized,'submit',submit,'signature',examiner_signature);
  select * into receipt from public.grading_batch_write_requests r where r.request_id = save_instructor_grading_batch.request_id;
  if found then
    if receipt.instructor_id <> owner or receipt.payload is distinct from payload then
      raise exception 'Grading request ID was reused' using errcode = 'PGB01';
    end if;
    return receipt.response;
  end if;
  if session_row.status = 'cancelled' then raise exception 'Cancelled grading sessions are read-only' using errcode = 'PGB03'; end if;
  if submit then
    if examiner_signature is null or jsonb_typeof(examiner_signature) <> 'object'
      or examiner_signature->>'version' is distinct from '1'
      or jsonb_typeof(examiner_signature->'strokes') is distinct from 'array'
      or pg_column_size(examiner_signature) > 262144 then
      raise exception 'A valid examiner signature is required' using errcode = '22023';
    end if;
    if jsonb_array_length(examiner_signature->'strokes') not between 1 and 1000 then
      raise exception 'A valid examiner signature is required' using errcode = '22023';
    end if;
    for stroke in select value from jsonb_array_elements(examiner_signature->'strokes') loop
      if jsonb_typeof(stroke) <> 'array' then raise exception 'Invalid signature stroke' using errcode = '22023'; end if;
      if jsonb_array_length(stroke) not between 1 and 10000 then raise exception 'Invalid signature stroke' using errcode = '22023'; end if;
      for point in select value from jsonb_array_elements(stroke) loop
        if jsonb_typeof(point->'x') is distinct from 'number' or jsonb_typeof(point->'y') is distinct from 'number' then
          raise exception 'Invalid signature point' using errcode = '22023';
        end if;
        if (point->>'x')::numeric not between 0 and 1 or (point->>'y')::numeric not between 0 and 1 then
          raise exception 'Invalid signature point' using errcode = '22023';
        end if;
      end loop;
    end loop;
  elsif examiner_signature is not null then raise exception 'Drafts cannot be signed' using errcode = '22023'; end if;
  select * into selected from public.grading_batches where event_id = target_event and instructor_id = owner
    and track = target_track and target_grade_id = target_grade for update;
  if found then
    -- Both draft and submitted batches may be revised by their owner. The
    -- expected version still prevents another tab's changes being overwritten.
    if selected.version <> expected_version then raise exception 'Grading draft changed' using errcode = 'PGB01'; end if;
  else
    if expected_version <> 0 then raise exception 'Grading draft changed' using errcode = 'PGB01'; end if;
    if not exists (select 1 from public.grade_tracks where grade_id = target_grade and track = target_track)
      or not exists (select 1 from public.syllabus_items where grade_id = target_grade and track = target_track)
      or exists (select 1 from public.gradings where event_id = target_event and track is not null and track <> target_track)
      or (exists (select 1 from public.grading_target_grades where grading_event_id = target_event)
        and not exists (select 1 from public.grading_target_grades where grading_event_id = target_event and grade_id = target_grade)) then
      raise exception 'Invalid grading track or target grade' using errcode = '22023';
    end if;
    insert into public.grading_batches(event_id,instructor_id,track,target_grade_id)
      values(target_event,owner,target_track,target_grade) returning * into selected;
    insert into public.grading_batch_students(batch_id,event_id,student_id,candidate_number,name)
      select selected.id, es.event_id, es.student_id, es.candidate_number,
        coalesce(nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),''),s.email)
      from public.event_students es join public.students s on s.id = es.student_id
      -- Each target grade is its own grading session: only candidates who
      -- applied for this grade (and have not withdrawn) are graded in it.
      join public.grading_applications ga on ga.student_id = es.student_id
        and ga.grading_event_id = es.event_id and ga.target_grade_id = target_grade and ga.status <> 'withdrawn'
      where es.event_id = target_event;
    insert into public.grading_batch_items(batch_id,syllabus_item_id,category,label,sort_order)
      select selected.id,id,category,label,sort_order from public.syllabus_items where track = target_track and grade_id = target_grade;
  end if;
  select (select count(*) from public.grading_batch_students where batch_id = selected.id)
    * (select count(*) from public.grading_batch_items where batch_id = selected.id) into expected_cells;
  if expected_cells = 0 or expected_cells <> jsonb_array_length(normalized) or exists (
    select 1 from jsonb_array_elements(normalized) x where
      not exists (select 1 from public.grading_batch_students s where s.batch_id = selected.id and s.student_id = (x->>'student_id')::uuid)
      or not exists (select 1 from public.grading_batch_items i where i.batch_id = selected.id and i.syllabus_item_id = x->>'syllabus_item_id')
  ) then raise exception 'The grading roster or syllabus changed. Reload the batch.' using errcode = 'PGB01'; end if;
  insert into public.grading_batch_results(batch_id,student_id,syllabus_item_id,checked)
    select selected.id,(value->>'student_id')::uuid,value->>'syllabus_item_id',(value->>'checked')::boolean
    from jsonb_array_elements(normalized)
    on conflict (batch_id,student_id,syllabus_item_id) do update set checked = excluded.checked;
  update public.grading_batches set version = case when expected_version = 0 then 1 else version + 1 end,
    status = case when submit then 'submitted' else 'draft' end,
    signature = examiner_signature, submitted_at = case when submit then clock_timestamp() else null end,
    updated_at = clock_timestamp() where id = selected.id;
  response := public.grading_batch_document(selected.id);
  -- Receipts preserve each earlier signed matrix even when the current batch is
  -- later edited. A draft save clears the old signature; resubmission re-signs.
  insert into public.grading_batch_write_requests(request_id,instructor_id,batch_id,payload,response)
    values(request_id,owner,selected.id,payload,response);
  return response;
end;
$$;
revoke all on function public.save_instructor_grading_batch(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,boolean,jsonb) from public, anon;
grant execute on function public.save_instructor_grading_batch(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,boolean,jsonb) to authenticated;

-- One grading day for an examiner: the session, its panel, and one grading
-- session per target grade with that grade's candidates and the caller's batch.
create function public.examiner_grading_day(target_event uuid)
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
        'candidates', (select coalesce(jsonb_agg(jsonb_build_object(
            'student_id', s.id, 'name', coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.email),
            'member_no', s.member_no, 'candidate_number', es.candidate_number,
            'current_grade', (select cg.label from public.grades cg where cg.id = s.current_grade_id))
            order by es.candidate_number nulls last, s.last_name, s.first_name, s.id), '[]'::jsonb)
          from public.grading_applications ga
          join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id
          join public.students s on s.id = ga.student_id
          where ga.grading_event_id = e.id and ga.target_grade_id = gr.id and ga.status <> 'withdrawn'),
        'my_batch', (select jsonb_build_object('status', b.status, 'version', b.version,
            'updated_at', b.updated_at, 'submitted_at', b.submitted_at)
          from public.grading_batches b
          where b.event_id = e.id and b.instructor_id = me and b.target_grade_id = gr.id)
      ) order by gr.sort_order, gr.id), '[]'::jsonb)
      from public.grading_target_grades t join public.grades gr on gr.id = t.grade_id
      where t.grading_event_id = e.id)
  ) into result
  from public.gradings g join public.events e on e.id = g.event_id join public.centres c on c.id = e.centre_id
  where g.event_id = target_event;
  return result;
end;
$$;
revoke all on function public.examiner_grading_day(uuid) from public, anon;
grant execute on function public.examiner_grading_day(uuid) to authenticated;

commit;
