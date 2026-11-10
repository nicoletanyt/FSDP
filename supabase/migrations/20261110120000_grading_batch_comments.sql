begin;

-- Keep the original RPC available to older clients. This wrapper participates in
-- the same transaction and extends its idempotency receipt with the comments.
create function public.save_instructor_grading_batch_with_comments(
  request_id uuid, expected_user uuid, target_event uuid, target_track public.grade_track,
  target_grade text, expected_version integer, cells jsonb, comments jsonb,
  submit boolean default false, examiner_signature jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  receipt public.grading_batch_write_requests%rowtype;
  request_document jsonb;
  result jsonb;
  batch uuid;
  item jsonb;
begin
  if auth.uid() is null or expected_user is distinct from auth.uid() then
    raise exception 'The grading account changed' using errcode = '42501';
  end if;
  owner := public.current_instructor_id();
  if owner is null then raise exception 'A linked instructor is required' using errcode = '42501'; end if;
  if comments is null or jsonb_typeof(comments) <> 'array' or jsonb_array_length(comments) > 100000
    or pg_column_size(comments) > 16000000 then
    raise exception 'Invalid grading comments' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(comments) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'student_id') is distinct from 'string'
      or coalesce(jsonb_typeof(item->'notes'), '') not in ('string', 'null')
      or length(item->>'notes') > 2000 then
      raise exception 'Invalid grading comment' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct (value->>'student_id')::uuid) from jsonb_array_elements(comments)) <> jsonb_array_length(comments) then
    raise exception 'Duplicate grading comments' using errcode = '22023';
  end if;

  request_document := jsonb_build_object('event', target_event, 'track', target_track, 'grade', target_grade,
    'version', expected_version, 'cells', cells, 'comments', comments, 'submit', submit, 'signature', examiner_signature);
  -- Match the original RPC's event lock so concurrent retries cannot race.
  perform 1 from public.events where id = target_event for update;
  select * into receipt from public.grading_batch_write_requests r where r.request_id = save_instructor_grading_batch_with_comments.request_id;
  if found then
    if receipt.instructor_id <> owner or receipt.payload->'comments_request' is distinct from request_document then
      raise exception 'Grading request ID was reused' using errcode = 'PGB01';
    end if;
    return receipt.response;
  end if;

  result := public.save_instructor_grading_batch(request_id, expected_user, target_event, target_track,
    target_grade, expected_version, cells, submit, examiner_signature);
  batch := (result->>'id')::uuid;
  if jsonb_array_length(comments) <> (select count(*) from public.grading_batch_students where batch_id = batch)
    or exists (select 1 from jsonb_array_elements(comments) c where not exists (
      select 1 from public.grading_batch_students s where s.batch_id = batch and s.student_id = (c->>'student_id')::uuid
    )) then
    raise exception 'The grading roster changed. Reload the batch.' using errcode = 'PGB01';
  end if;
  update public.grading_batch_students s set notes = c.value->>'notes'
    from jsonb_array_elements(comments) c
    where s.batch_id = batch and s.student_id = (c.value->>'student_id')::uuid;
  result := public.grading_batch_document(batch);
  update public.grading_batch_write_requests r set payload = r.payload || jsonb_build_object('comments_request', request_document), response = result
    where r.request_id = save_instructor_grading_batch_with_comments.request_id;
  return result;
end;
$$;
revoke all on function public.save_instructor_grading_batch_with_comments(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,jsonb,boolean,jsonb) from public, anon;
grant execute on function public.save_instructor_grading_batch_with_comments(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,jsonb,boolean,jsonb) to authenticated;

commit;
