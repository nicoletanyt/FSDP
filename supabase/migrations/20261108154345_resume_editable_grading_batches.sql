begin;

create index grading_batches_latest_owner_idx on public.grading_batches(instructor_id, event_id, updated_at desc, id desc);

create function public.get_latest_instructor_grading_batch(target_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := public.current_instructor_id(); selected uuid;
begin
  if owner is null then raise exception 'A linked instructor is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.gradings where event_id = target_event) then
    raise exception 'Grading session not found' using errcode = '42501';
  end if;
  select id into selected from public.grading_batches
    where event_id = target_event and instructor_id = owner
    order by updated_at desc, id desc limit 1;
  return public.grading_batch_document(selected);
end;
$$;
revoke all on function public.get_latest_instructor_grading_batch(uuid) from public, anon;
grant execute on function public.get_latest_instructor_grading_batch(uuid) to authenticated;

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
      from public.event_students es join public.students s on s.id = es.student_id where es.event_id = target_event;
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

commit;
