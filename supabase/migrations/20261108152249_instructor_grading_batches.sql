begin;

-- Candidate numbers belong to the session, not a filtered/sorted UI row.
alter table public.event_students add column candidate_number integer check (candidate_number > 0);
with numbered as (
  select es.event_id, es.student_id, row_number() over (partition by es.event_id order by es.student_id)::integer as number
  from public.event_students es join public.gradings g on g.event_id = es.event_id
)
update public.event_students es set candidate_number = n.number from numbered n
where es.event_id = n.event_id and es.student_id = n.student_id;
create unique index event_students_candidate_number_key on public.event_students(event_id, candidate_number);

create function public.assign_grading_candidate_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.event_id = old.event_id and new.student_id = old.student_id then
    new.candidate_number := old.candidate_number;
    return new;
  end if;
  if exists (select 1 from public.gradings where event_id = new.event_id) then
    perform 1 from public.events where id = new.event_id for update;
    select coalesce(max(candidate_number), 0) + 1 into new.candidate_number
      from public.event_students where event_id = new.event_id;
  else
    new.candidate_number := null;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_grading_candidate_number() from public, anon, authenticated;
create trigger event_students_candidate_number before insert or update on public.event_students
for each row execute function public.assign_grading_candidate_number();

create table public.grading_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gradings(event_id),
  instructor_id uuid not null references public.instructors(id),
  track public.grade_track not null,
  target_grade_id text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  version integer not null default 1 check (version > 0),
  signature jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, instructor_id, track, target_grade_id),
  unique (id, event_id),
  foreign key (target_grade_id, track) references public.grade_tracks(grade_id, track),
  check ((status = 'draft' and signature is null and submitted_at is null)
    or (status = 'submitted' and signature is not null and submitted_at is not null))
);
create index grading_batches_instructor_idx on public.grading_batches(instructor_id);
create index grading_batches_grade_idx on public.grading_batches(target_grade_id, track);

create table public.grading_batch_students (
  batch_id uuid not null,
  event_id uuid not null,
  student_id uuid not null,
  candidate_number integer not null check (candidate_number > 0),
  name text not null,
  notes text,
  primary key (batch_id, student_id),
  unique (batch_id, candidate_number),
  foreign key (batch_id, event_id) references public.grading_batches(id, event_id),
  foreign key (event_id, student_id) references public.event_students(event_id, student_id)
);
create index grading_batch_students_roster_idx on public.grading_batch_students(event_id, student_id);
create index grading_batch_students_student_idx on public.grading_batch_students(student_id);

create table public.grading_batch_items (
  batch_id uuid not null references public.grading_batches(id),
  syllabus_item_id text not null references public.syllabus_items(id),
  category text not null,
  label text not null,
  sort_order integer not null,
  primary key (batch_id, syllabus_item_id)
);
create index grading_batch_items_syllabus_idx on public.grading_batch_items(syllabus_item_id);

create table public.grading_batch_results (
  batch_id uuid not null,
  student_id uuid not null,
  syllabus_item_id text not null,
  checked boolean not null,
  primary key (batch_id, student_id, syllabus_item_id),
  foreign key (batch_id, student_id) references public.grading_batch_students(batch_id, student_id),
  foreign key (batch_id, syllabus_item_id) references public.grading_batch_items(batch_id, syllabus_item_id)
);
create index grading_batch_results_item_idx on public.grading_batch_results(batch_id, syllabus_item_id);

-- Exact receipts make retries safe even if the first response was lost.
create table public.grading_batch_write_requests (
  request_id uuid primary key,
  instructor_id uuid not null references public.instructors(id),
  batch_id uuid not null references public.grading_batches(id),
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
create index grading_batch_write_requests_owner_idx on public.grading_batch_write_requests(instructor_id);
create index grading_batch_write_requests_batch_idx on public.grading_batch_write_requests(batch_id);

alter table public.grading_batches enable row level security;
alter table public.grading_batch_students enable row level security;
alter table public.grading_batch_items enable row level security;
alter table public.grading_batch_results enable row level security;
alter table public.grading_batch_write_requests enable row level security;
revoke all on public.grading_batches, public.grading_batch_students, public.grading_batch_items,
  public.grading_batch_results, public.grading_batch_write_requests from public, anon, authenticated;
grant select on public.grading_batches, public.grading_batch_students, public.grading_batch_items,
  public.grading_batch_results to authenticated;
create policy "Owners and administrators read grading batches" on public.grading_batches for select to authenticated
using (instructor_id = (select public.current_instructor_id()) or (select public.is_administrator()));
create policy "Read own batch students" on public.grading_batch_students for select to authenticated
using (exists (select 1 from public.grading_batches b where b.id = batch_id));
create policy "Read own batch items" on public.grading_batch_items for select to authenticated
using (exists (select 1 from public.grading_batches b where b.id = batch_id));
create policy "Read own batch results" on public.grading_batch_results for select to authenticated
using (exists (select 1 from public.grading_batches b where b.id = batch_id));

-- Internal helper: deliberately not executable through PostgREST.
create function public.grading_batch_document(target_batch uuid)
returns jsonb language sql stable set search_path = '' as $$
  select to_jsonb(b) || jsonb_build_object(
    'students', coalesce((select jsonb_agg(to_jsonb(s) order by s.candidate_number)
      from public.grading_batch_students s where s.batch_id = b.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.category, i.sort_order, i.syllabus_item_id)
      from public.grading_batch_items i where i.batch_id = b.id), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(to_jsonb(r) order by r.student_id, r.syllabus_item_id)
      from public.grading_batch_results r where r.batch_id = b.id), '[]'::jsonb)
  ) from public.grading_batches b where b.id = target_batch;
$$;
revoke all on function public.grading_batch_document(uuid) from public, anon, authenticated;

create function public.get_instructor_grading_batch(target_event uuid, target_track public.grade_track, target_grade text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := public.current_instructor_id(); selected uuid;
begin
  if owner is null then raise exception 'A linked instructor is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.gradings where event_id = target_event) then
    raise exception 'Grading session not found' using errcode = '42501';
  end if;
  select id into selected from public.grading_batches where event_id = target_event and instructor_id = owner
    and track = target_track and target_grade_id = target_grade;
  return public.grading_batch_document(selected);
end;
$$;
revoke all on function public.get_instructor_grading_batch(uuid,public.grade_track,text) from public, anon;
grant execute on function public.get_instructor_grading_batch(uuid,public.grade_track,text) to authenticated;

create function public.save_instructor_grading_batch(
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
  -- Serializes first creation, retries and roster membership changes.
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
    if selected.status = 'submitted' then raise exception 'Submitted grading batches are locked' using errcode = 'PGB02'; end if;
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
  insert into public.grading_batch_write_requests(request_id,instructor_id,batch_id,payload,response)
    values(request_id,owner,selected.id,payload,response);
  -- Intentionally no writes to student grades, legacy assessments or sign-offs.
  return response;
end;
$$;
revoke all on function public.save_instructor_grading_batch(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,boolean,jsonb) from public, anon;
grant execute on function public.save_instructor_grading_batch(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,boolean,jsonb) to authenticated;

-- Shared grading sessions are discoverable by every linked instructor. Other
-- event types retain their original assignment filter and write permissions.
create or replace function public.instructor_calendar(
  range_from timestamptz, range_to timestamptz, page_size integer default 50, page_offset integer default 0
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare caller uuid;
begin
  if public.current_user_role() is distinct from 'instructor'::public.user_role then
    raise exception 'Instructor access is required' using errcode = '42501';
  end if;
  caller := public.current_instructor_id();
  if range_from is null or range_to is null or range_to <= range_from or range_to - range_from > interval '62 days'
    or page_size is null or page_size not between 1 and 100 or page_offset is null or page_offset < 0 then
    raise exception 'Invalid calendar range or pagination' using errcode = '22023';
  end if;
  return (
    with scope as (
      select e,c,cl,ct,gr,se,w,
        coalesce(e.starts_at,gr.grading_date::timestamp at time zone 'Asia/Singapore') as calendar_order
      from public.events e
      left join public.centres c on c.id=e.centre_id
      left join public.classes cl on cl.event_id=e.id
      left join public.class_types ct on ct.id=cl.class_type_id
      left join public.gradings gr on gr.event_id=e.id
      left join public.seminars se on se.event_id=e.id
      left join public.workshops w on w.event_id=e.id
      where caller is not null and (e.instructor_id=caller or e.event_type='grading') and (
        (e.starts_at<range_to and e.ends_at>range_from)
        or (e.event_type='grading' and e.starts_at is null
          and gr.grading_date::timestamp at time zone 'Asia/Singapore'<range_to
          and (gr.grading_date+1)::timestamp at time zone 'Asia/Singapore'>range_from)
      )
    ), page as (select * from scope order by calendar_order,(e).id limit page_size offset page_offset)
    select jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(p.e)||jsonb_build_object(
        'centre',to_jsonb(p.c),
        'class',case when (p.cl).event_id is null then null else to_jsonb(p.cl)||jsonb_build_object('class_type',to_jsonb(p.ct)) end,
        'grading',case when (p.gr).event_id is null then null else to_jsonb(p.gr)||jsonb_build_object('target_grades',
          coalesce((select jsonb_agg(jsonb_build_object('grade',to_jsonb(g)) order by g.sort_order,g.id)
            from public.grading_target_grades t join public.grades g on g.id=t.grade_id where t.grading_event_id=(p.e).id),'[]'::jsonb)) end,
        'seminar',to_jsonb(p.se),'workshop',to_jsonb(p.w),
        'participants',jsonb_build_array(jsonb_build_object('count',(select count(*) from public.event_students es where es.event_id=(p.e).id)))
      ) order by p.calendar_order,(p.e).id) from page p),'[]'::jsonb),
      'total',(select count(*) from scope),'offset',page_offset,'limit',page_size
    )
  );
end;
$$;
revoke all on function public.instructor_calendar(timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.instructor_calendar(timestamptz,timestamptz,integer,integer) to authenticated;

commit;
