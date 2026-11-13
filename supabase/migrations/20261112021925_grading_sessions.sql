begin;

-- A grading session is a time slot on a grading day. Administrators sort
-- applicants into sessions once applications close; one session can hold
-- several target grades. Before sorting, a grading has no sessions.
create table public.grading_sessions (
  id uuid primary key default gen_random_uuid(),
  grading_event_id uuid not null references public.gradings(event_id) on delete cascade,
  position integer not null check (position > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint grading_sessions_position_key unique (grading_event_id, position) deferrable initially deferred,
  constraint grading_sessions_event_key unique (id, grading_event_id),
  constraint grading_sessions_time_check check (
    (starts_at is null and ends_at is null) or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);
alter table public.grading_sessions enable row level security;
grant select on public.grading_sessions to authenticated;
create policy "Administrators and panel examiners read grading sessions" on public.grading_sessions
for select to authenticated
using ((select public.is_administrator()) or public.is_on_grading_panel(grading_event_id));

alter table public.grading_applications add column session_id uuid,
  add constraint grading_applications_session_fkey foreign key (session_id, grading_event_id)
    references public.grading_sessions(id, grading_event_id) on delete set null (session_id);
create index grading_applications_session_idx on public.grading_applications(session_id);

-- Backfill: each grade that already had its own time becomes one session.
create temporary table grading_session_backfill on commit drop as
select gen_random_uuid() as id, t.grading_event_id, t.grade_id, t.starts_at, t.ends_at,
  row_number() over (partition by t.grading_event_id order by t.starts_at, g.sort_order, g.id)::integer as position
from public.grading_target_grades t join public.grades g on g.id = t.grade_id
where t.starts_at is not null;
insert into public.grading_sessions(id, grading_event_id, position, starts_at, ends_at)
  select id, grading_event_id, position, starts_at, ends_at from grading_session_backfill;
update public.grading_applications ga set session_id = b.id from grading_session_backfill b
  where b.grading_event_id = ga.grading_event_id and b.grade_id = ga.target_grade_id and ga.status <> 'withdrawn';

-- Checklists are now per session: one batch holds every grade in it.
alter table public.grading_batches add column session_id uuid;
update public.grading_batches gb set session_id = b.id from grading_session_backfill b
  where b.grading_event_id = gb.event_id and b.grade_id = gb.target_grade_id;
do $$ begin
  if exists (select 1 from public.grading_batches where session_id is null) then
    raise exception 'A grading batch has no session to move into';
  end if;
end $$;
alter table public.grading_batch_students add column target_grade_id text references public.grades(id);
update public.grading_batch_students s set target_grade_id = b.target_grade_id from public.grading_batches b where b.id = s.batch_id;
alter table public.grading_batch_students alter column target_grade_id set not null;
alter table public.grading_batch_items add column grade_id text references public.grades(id);
update public.grading_batch_items i set grade_id = b.target_grade_id from public.grading_batches b where b.id = i.batch_id;
alter table public.grading_batch_items alter column grade_id set not null;
-- Dropping the grade column also drops its old per-grade unique key and index.
alter table public.grading_batches drop column target_grade_id,
  alter column session_id set not null,
  add constraint grading_batches_session_fkey foreign key (session_id, event_id) references public.grading_sessions(id, grading_event_id),
  add constraint grading_batches_owner_session_key unique (event_id, instructor_id, session_id);
create index grading_batches_session_idx on public.grading_batches(session_id);
alter table public.grading_target_grades drop column starts_at, drop column ends_at;

drop function public.save_instructor_grading_batch_with_comments(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,jsonb,boolean,jsonb);
drop function public.save_instructor_grading_batch(uuid,uuid,uuid,public.grade_track,text,integer,jsonb,boolean,jsonb);
drop function public.get_instructor_grading_batch(uuid,public.grade_track,text);

create or replace function public.grading_batch_document(target_batch uuid)
returns jsonb language sql stable set search_path = '' as $$
  select to_jsonb(b) || jsonb_build_object(
    'students', coalesce((select jsonb_agg(to_jsonb(s) order by s.candidate_number)
      from public.grading_batch_students s where s.batch_id = b.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by g.sort_order, i.grade_id, i.category, i.sort_order, i.syllabus_item_id)
      from public.grading_batch_items i join public.grades g on g.id = i.grade_id where i.batch_id = b.id), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(to_jsonb(r) order by r.student_id, r.syllabus_item_id)
      from public.grading_batch_results r where r.batch_id = b.id), '[]'::jsonb)
  ) from public.grading_batches b where b.id = target_batch;
$$;
revoke all on function public.grading_batch_document(uuid) from public, anon, authenticated;

-- Grading has started once anything is recorded against the roster; sessions
-- (and the roster's candidate numbers) are then locked.
create function public.grading_started(target_event uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.grading_batches where event_id = target_event)
    or exists (select 1 from public.instructor_grading_reviews where event_id = target_event)
    or exists (select 1 from public.technique_sign_offs where event_id = target_event);
end;
$$;
revoke all on function public.grading_started(uuid) from public, anon;
grant execute on function public.grading_started(uuid) to authenticated;

-- One grading day: its details, every applicant (sorted or not), and its sessions.
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
  with applicants as (
    select ga.id as application_id, ga.session_id, ga.target_grade_id, s.id as student_id, s.first_name, s.last_name,
      coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.email) as name, s.member_no,
      es.candidate_number,
      jsonb_build_object('id', tg.id, 'label', tg.label, 'colour', tg.colour, 'is_ranked', tg.is_ranked, 'sort_order', tg.sort_order) as target_grade,
      tg.sort_order as target_order,
      (select jsonb_build_object('id', cg.id, 'label', cg.label, 'colour', cg.colour, 'is_ranked', cg.is_ranked, 'sort_order', cg.sort_order)
        from public.grades cg where cg.id = s.current_grade_id) as current_grade
    from public.grading_applications ga
    join public.students s on s.id = ga.student_id
    join public.grades tg on tg.id = ga.target_grade_id
    left join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id
    where ga.grading_event_id = target_event and ga.status <> 'withdrawn'
  )
  select jsonb_build_object(
    'event_id', e.id, 'name', e.name, 'status', e.status, 'track', g.track,
    'grading_date', coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date),
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'reporting_time', g.reporting_time,
    'application_deadline', g.application_deadline,
    'grading_started', public.grading_started(e.id),
    'centre', jsonb_build_object('name', c.name, 'address', c.address),
    'is_chief', coalesce((select m.is_chief from public.grading_panel_members m
      where m.grading_event_id = e.id and m.instructor_id = me), false),
    'panel', (select coalesce(jsonb_agg(jsonb_build_object(
        'instructor_id', p.instructor_id, 'name', trim(i.first_name || ' ' || i.last_name), 'is_chief', p.is_chief)
        order by p.is_chief desc, p.added_at, p.instructor_id), '[]'::jsonb)
      from public.grading_panel_members p join public.instructors i on i.id = p.instructor_id
      where p.grading_event_id = e.id),
    'students', (select coalesce(jsonb_agg(jsonb_build_object(
        'application_id', a.application_id, 'student_id', a.student_id, 'name', a.name, 'member_no', a.member_no,
        'candidate_number', a.candidate_number, 'current_grade', a.current_grade, 'target_grade', a.target_grade,
        'session_id', a.session_id)
        order by a.candidate_number nulls last, a.last_name, a.first_name, a.student_id), '[]'::jsonb)
      from applicants a),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', gs.id, 'position', gs.position, 'starts_at', gs.starts_at, 'ends_at', gs.ends_at,
        'grades', (select coalesce(jsonb_agg(jsonb_build_object('grade', grouped.target_grade, 'candidates', grouped.candidates)
            order by grouped.target_order, grouped.target_grade_id), '[]'::jsonb)
          from (select a.target_grade_id, a.target_grade, a.target_order,
              jsonb_agg(jsonb_build_object('application_id', a.application_id, 'student_id', a.student_id, 'name', a.name,
                'member_no', a.member_no, 'candidate_number', a.candidate_number, 'current_grade', a.current_grade)
                order by a.candidate_number nulls last, a.last_name, a.first_name, a.student_id) as candidates
            from applicants a where a.session_id = gs.id
            group by a.target_grade_id, a.target_grade, a.target_order) grouped),
        'my_batch', (select jsonb_build_object('status', b.status, 'version', b.version,
            'updated_at', b.updated_at, 'submitted_at', b.submitted_at)
          from public.grading_batches b where b.session_id = gs.id and b.instructor_id = me))
        order by gs.position), '[]'::jsonb)
      from public.grading_sessions gs where gs.grading_event_id = e.id)
  ) into result
  from public.gradings g join public.events e on e.id = g.event_id join public.centres c on c.id = e.centre_id
  where g.event_id = target_event;
  return result;
end;
$$;
revoke all on function public.examiner_grading_day(uuid) from public, anon;
grant execute on function public.examiner_grading_day(uuid) to authenticated;

-- Applicants per grade, one back-to-back 30-minute session per grade in grade
-- order from the grading's start. The roster is rebuilt so candidate numbers
-- run 1..n through the sessions. Re-sorting discards manual moves.
create function public.sort_grading_sessions(target_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  grading public.gradings%rowtype;
  event_row public.events%rowtype;
  slot constant interval := interval '30 minutes';
  grade_row record;
  candidate record;
  created uuid;
  sessions integer := 0;
begin
  if not (select public.is_administrator()) then
    raise exception 'Only administrators can sort grading sessions' using errcode = '42501';
  end if;
  select * into event_row from public.events where id = target_event for update;
  select * into grading from public.gradings where event_id = target_event;
  if not found then raise exception 'Grading session not found' using errcode = '22023'; end if;
  if event_row.status = 'cancelled' then raise exception 'Cancelled gradings cannot be sorted' using errcode = 'PGS01'; end if;
  if grading.application_deadline is not null and (now() at time zone 'Asia/Singapore')::date <= grading.application_deadline then
    raise exception 'Applications are still open' using errcode = 'PGS01';
  end if;
  if grading.track is null then raise exception 'Set the grading''s track before sorting' using errcode = 'PGS01'; end if;
  if event_row.starts_at is null then raise exception 'Set the grading''s start time before sorting' using errcode = 'PGS01'; end if;
  if public.grading_started(target_event) then
    raise exception 'Grading has started, so sessions are locked' using errcode = 'PGS02';
  end if;

  delete from public.grading_sessions where grading_event_id = target_event;
  for grade_row in
    select gr.id from public.grades gr
    where gr.id in (select ga.target_grade_id from public.grading_applications ga
      where ga.grading_event_id = target_event and ga.status <> 'withdrawn')
    order by gr.sort_order, gr.id
  loop
    insert into public.grading_sessions(grading_event_id, position, starts_at, ends_at)
      values (target_event, sessions + 1, event_row.starts_at + sessions * slot, event_row.starts_at + (sessions + 1) * slot)
      returning id into created;
    update public.grading_applications set session_id = created
      where grading_event_id = target_event and target_grade_id = grade_row.id and status <> 'withdrawn';
    sessions := sessions + 1;
  end loop;
  if sessions > 0 then
    update public.events set ends_at = starts_at + sessions * slot where id = target_event;
  end if;

  -- One row at a time so the numbering trigger assigns 1..n in session order.
  delete from public.event_students where event_id = target_event;
  for candidate in
    select ga.student_id from public.grading_applications ga
    join public.grading_sessions gs on gs.id = ga.session_id
    join public.grades gr on gr.id = ga.target_grade_id
    join public.students s on s.id = ga.student_id
    where ga.grading_event_id = target_event and ga.status <> 'withdrawn'
    order by gs.position, gr.sort_order, s.last_name, s.first_name, s.id
  loop
    insert into public.event_students(event_id, student_id) values (target_event, candidate.student_id);
  end loop;
  return public.examiner_grading_day(target_event);
end;
$$;
revoke all on function public.sort_grading_sessions(uuid) from public, anon;
grant execute on function public.sort_grading_sessions(uuid) to authenticated;

-- Move one applicant into another session of the same grading. A session left
-- empty is removed and the rest renumbered; times and candidate numbers stay.
create function public.move_grading_candidate(target_application uuid, target_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  application public.grading_applications%rowtype;
  previous uuid;
begin
  if not (select public.is_administrator()) then
    raise exception 'Only administrators can move grading candidates' using errcode = '42501';
  end if;
  select * into application from public.grading_applications where id = target_application;
  if not found or application.status = 'withdrawn' then
    raise exception 'Grading application not found' using errcode = '22023';
  end if;
  perform 1 from public.events where id = application.grading_event_id for update;
  if public.grading_started(application.grading_event_id) then
    raise exception 'Grading has started, so sessions are locked' using errcode = 'PGS02';
  end if;
  if not exists (select 1 from public.grading_sessions where id = target_session and grading_event_id = application.grading_event_id) then
    raise exception 'Choose a session from the same grading' using errcode = '22023';
  end if;
  previous := application.session_id;
  update public.grading_applications set session_id = target_session where id = target_application;
  if previous is not null and previous <> target_session and not exists (
    select 1 from public.grading_applications where session_id = previous and status <> 'withdrawn') then
    delete from public.grading_sessions where id = previous;
    update public.grading_sessions s set position = ordered.position
      from (select id, row_number() over (order by position)::integer as position from public.grading_sessions
        where grading_event_id = application.grading_event_id) ordered
      where s.id = ordered.id and s.position <> ordered.position;
  end if;
  return public.examiner_grading_day(application.grading_event_id);
end;
$$;
revoke all on function public.move_grading_candidate(uuid, uuid) from public, anon;
grant execute on function public.move_grading_candidate(uuid, uuid) to authenticated;

create function public.get_instructor_grading_batch(target_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := public.current_instructor_id(); selected uuid;
begin
  if owner is null then raise exception 'A linked instructor is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.grading_sessions where id = target_session) then
    raise exception 'Grading session not found' using errcode = '42501';
  end if;
  select id into selected from public.grading_batches where session_id = target_session and instructor_id = owner;
  return public.grading_batch_document(selected);
end;
$$;
revoke all on function public.get_instructor_grading_batch(uuid) from public, anon;
grant execute on function public.get_instructor_grading_batch(uuid) to authenticated;

-- One examiner's checklist for one session: each candidate is graded on their
-- own target grade's techniques only.
create function public.save_instructor_grading_batch(
  request_id uuid, expected_user uuid, target_session uuid, expected_version integer, cells jsonb,
  submit boolean default false, examiner_signature jsonb default null
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
  session_row public.grading_sessions%rowtype;
  event_row public.events%rowtype;
  grading_track public.grade_track;
  expected_cells bigint;
begin
  if auth.uid() is null or expected_user is distinct from auth.uid() then
    raise exception 'The grading account changed' using errcode = '42501';
  end if;
  owner := public.current_instructor_id();
  if owner is null then raise exception 'A linked instructor is required' using errcode = '42501'; end if;
  select * into session_row from public.grading_sessions where id = target_session;
  if not found then raise exception 'Grading session not found' using errcode = '42501'; end if;
  select * into event_row from public.events where id = session_row.grading_event_id for update;
  select g.track into grading_track from public.gradings g where g.event_id = session_row.grading_event_id;
  if request_id is null or expected_version is null or expected_version < 0 or submit is null or cells is null
    or jsonb_typeof(cells) <> 'array' or jsonb_array_length(cells) not between 1 and 100000 or pg_column_size(cells) > 16000000 then
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
  payload := jsonb_build_object('session', target_session, 'version', expected_version, 'cells', normalized,
    'submit', submit, 'signature', examiner_signature);
  select * into receipt from public.grading_batch_write_requests r where r.request_id = save_instructor_grading_batch.request_id;
  if found then
    if receipt.instructor_id <> owner or receipt.payload is distinct from payload then
      raise exception 'Grading request ID was reused' using errcode = 'PGB01';
    end if;
    return receipt.response;
  end if;
  if event_row.status = 'cancelled' then raise exception 'Cancelled grading sessions are read-only' using errcode = 'PGB03'; end if;
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
  select * into selected from public.grading_batches where session_id = target_session and instructor_id = owner for update;
  if found then
    -- Both draft and submitted batches may be revised by their owner. The
    -- expected version still prevents another tab's changes being overwritten.
    if selected.version <> expected_version then raise exception 'Grading draft changed' using errcode = 'PGB01'; end if;
  else
    if expected_version <> 0 then raise exception 'Grading draft changed' using errcode = 'PGB01'; end if;
    if grading_track is null then raise exception 'Invalid grading track or target grade' using errcode = '22023'; end if;
    insert into public.grading_batches(event_id, instructor_id, track, session_id)
      values (session_row.grading_event_id, owner, grading_track, target_session) returning * into selected;
    insert into public.grading_batch_students(batch_id, event_id, student_id, candidate_number, name, target_grade_id)
      select selected.id, es.event_id, es.student_id, es.candidate_number,
        coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.email), ga.target_grade_id
      from public.grading_applications ga
      join public.event_students es on es.event_id = ga.grading_event_id and es.student_id = ga.student_id
      join public.students s on s.id = ga.student_id
      where ga.session_id = target_session and ga.status <> 'withdrawn';
    insert into public.grading_batch_items(batch_id, syllabus_item_id, category, label, sort_order, grade_id)
      select selected.id, si.id, si.category, si.label, si.sort_order, si.grade_id from public.syllabus_items si
      where si.track = grading_track and si.grade_id in (select target_grade_id from public.grading_batch_students where batch_id = selected.id);
  end if;
  select count(*) into expected_cells from public.grading_batch_students s
    join public.grading_batch_items i on i.batch_id = s.batch_id and i.grade_id = s.target_grade_id
    where s.batch_id = selected.id;
  if expected_cells = 0 or expected_cells <> jsonb_array_length(normalized) or exists (
    select 1 from jsonb_array_elements(normalized) x where not exists (
      select 1 from public.grading_batch_students s
      join public.grading_batch_items i on i.batch_id = s.batch_id and i.grade_id = s.target_grade_id
      where s.batch_id = selected.id and s.student_id = (x->>'student_id')::uuid and i.syllabus_item_id = x->>'syllabus_item_id')
  ) then raise exception 'The grading roster or syllabus changed. Reload the batch.' using errcode = 'PGB01'; end if;
  insert into public.grading_batch_results(batch_id, student_id, syllabus_item_id, checked)
    select selected.id, (value->>'student_id')::uuid, value->>'syllabus_item_id', (value->>'checked')::boolean
    from jsonb_array_elements(normalized)
    on conflict (batch_id, student_id, syllabus_item_id) do update set checked = excluded.checked;
  update public.grading_batches set version = case when expected_version = 0 then 1 else version + 1 end,
    status = case when submit then 'submitted' else 'draft' end,
    signature = examiner_signature, submitted_at = case when submit then clock_timestamp() else null end,
    updated_at = clock_timestamp() where id = selected.id;
  response := public.grading_batch_document(selected.id);
  -- Receipts preserve each earlier signed matrix even when the current batch is
  -- later edited. A draft save clears the old signature; resubmission re-signs.
  insert into public.grading_batch_write_requests(request_id, instructor_id, batch_id, payload, response)
    values (request_id, owner, selected.id, payload, response);
  return response;
end;
$$;
revoke all on function public.save_instructor_grading_batch(uuid,uuid,uuid,integer,jsonb,boolean,jsonb) from public, anon;
grant execute on function public.save_instructor_grading_batch(uuid,uuid,uuid,integer,jsonb,boolean,jsonb) to authenticated;

-- Same transaction as the save, extending its idempotency receipt with the comments.
create function public.save_instructor_grading_batch_with_comments(
  request_id uuid, expected_user uuid, target_session uuid, expected_version integer, cells jsonb, comments jsonb,
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

  request_document := jsonb_build_object('session', target_session, 'version', expected_version, 'cells', cells,
    'comments', comments, 'submit', submit, 'signature', examiner_signature);
  -- Match the save's event lock so concurrent retries cannot race.
  perform 1 from public.events e join public.grading_sessions s on s.grading_event_id = e.id
    where s.id = target_session for update of e;
  select * into receipt from public.grading_batch_write_requests r where r.request_id = save_instructor_grading_batch_with_comments.request_id;
  if found then
    if receipt.instructor_id <> owner or receipt.payload->'comments_request' is distinct from request_document then
      raise exception 'Grading request ID was reused' using errcode = 'PGB01';
    end if;
    return receipt.response;
  end if;

  result := public.save_instructor_grading_batch(request_id, expected_user, target_session, expected_version,
    cells, submit, examiner_signature);
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
revoke all on function public.save_instructor_grading_batch_with_comments(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,jsonb) from public, anon;
grant execute on function public.save_instructor_grading_batch_with_comments(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,jsonb) to authenticated;

-- Calendar: target grades no longer carry times; panel members get one block
-- per sorted session instead.
create or replace function public.instructor_calendar(range_from timestamp with time zone, range_to timestamp with time zone, page_size integer default 50, page_offset integer default 0)
returns jsonb language plpgsql stable set search_path to '' as $function$
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
        'grading',case when (p.gr).event_id is null then null else to_jsonb(p.gr)||jsonb_build_object(
          'target_grades',coalesce((select jsonb_agg(jsonb_build_object('grade',to_jsonb(g)) order by g.sort_order,g.id)
            from public.grading_target_grades t join public.grades g on g.id=t.grade_id where t.grading_event_id=(p.e).id),'[]'::jsonb),
          'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'position',s.position,'starts_at',s.starts_at,'ends_at',s.ends_at,
              'candidates',(select count(*) from public.grading_applications ga where ga.session_id=s.id and ga.status<>'withdrawn'),
              'grades',coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order,g.id) from public.grades g
                where g.id in (select ga.target_grade_id from public.grading_applications ga where ga.session_id=s.id and ga.status<>'withdrawn')),'[]'::jsonb))
              order by s.position)
            from public.grading_sessions s where s.grading_event_id=(p.e).id),'[]'::jsonb)) end,
        'on_panel',(p.gr).event_id is not null and public.is_on_grading_panel((p.e).id),
        'seminar',to_jsonb(p.se),'workshop',to_jsonb(p.w),
        'participants',jsonb_build_array(jsonb_build_object('count',(select count(*) from public.event_students es where es.event_id=(p.e).id)))
      ) order by p.calendar_order,(p.e).id) from page p),'[]'::jsonb),
      'total',(select count(*) from scope),'offset',page_offset,'limit',page_size
    )
  );
end;
$function$;

commit;
