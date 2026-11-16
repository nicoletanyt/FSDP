-- Progress checklist. Technique sign-offs become technique progress with a
-- coaching status: no row (or a null status) is "Not assessed", then
-- Introduced, Developing and Consistent. Existing sign-offs become Consistent.
-- Updating progress is always optional and does not affect grading eligibility.
-- Instructors write through set_technique_progress; every change is kept in
-- technique_progress_history (who, when, previous and new status).
begin;

create type public.technique_status as enum ('introduced', 'developing', 'consistent');

alter table public.technique_sign_offs rename to technique_progress;
alter table public.technique_progress rename column signed_off_at to updated_at;
alter table public.technique_progress rename column signed_off_by to updated_by;
alter table public.technique_progress add column status public.technique_status default 'consistent';
alter table public.technique_progress alter column status drop default;
alter table public.technique_progress add constraint technique_progress_note_length check (char_length(note) <= 1000) not valid;

alter index if exists public.technique_sign_offs_student_idx rename to technique_progress_student_idx;
alter index if exists public.technique_sign_offs_item_idx rename to technique_progress_item_idx;
alter index if exists public.technique_sign_offs_instructor_idx rename to technique_progress_updated_by_idx;
-- Redundant with the unique key below.
drop index if exists public.technique_sign_offs_student_syllabus_idx;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'technique_sign_offs_pkey') then
    alter table public.technique_progress rename constraint technique_sign_offs_pkey to technique_progress_pkey;
  end if;
  -- One record per student and technique; set_technique_progress upserts on it.
  -- Some installations only had an event-scoped key, retired in the previous migration.
  if exists (select 1 from pg_constraint where conname = 'technique_sign_offs_student_id_syllabus_item_id_key') then
    alter table public.technique_progress rename constraint technique_sign_offs_student_id_syllabus_item_id_key
      to technique_progress_student_id_syllabus_item_id_key;
  else
    alter table public.technique_progress add constraint technique_progress_student_id_syllabus_item_id_key
      unique (student_id, syllabus_item_id);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technique_progress'
      and policyname = 'Students and instructors read sign offs') then
    alter policy "Students and instructors read sign offs" on public.technique_progress
      rename to "Students and instructors read technique progress";
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technique_progress'
      and policyname = 'Instructors read all student sign offs') then
    alter policy "Instructors read all student sign offs" on public.technique_progress
      rename to "Instructors read all technique progress";
  end if;
end;
$$;

-- Writes go through set_technique_progress; administrators keep direct access.
drop policy if exists "Admins and instructors manage sign offs" on public.technique_progress;
drop policy if exists "Admins manage sign offs" on public.technique_progress;
create policy "Administrators manage technique progress" on public.technique_progress
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create table public.technique_progress_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  syllabus_item_id text not null references public.syllabus_items(id) on delete cascade,
  previous_status public.technique_status,
  new_status public.technique_status,
  note text,
  changed_by uuid references public.instructors(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index technique_progress_history_item_idx
  on public.technique_progress_history (student_id, syllabus_item_id, changed_at desc);
create index technique_progress_history_changed_by_idx on public.technique_progress_history (changed_by);

alter table public.technique_progress_history enable row level security;
create policy "Administrators and instructors read technique progress history" on public.technique_progress_history
for select to authenticated
using (public.is_administrator() or public.current_instructor_id() is not null);
revoke insert, update, delete, truncate on public.technique_progress_history from anon, authenticated;
grant select on public.technique_progress_history to authenticated;

-- Appends one history row per change. A null status means Not assessed.
create function public.record_technique_progress_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.technique_progress_history (student_id, syllabus_item_id, previous_status, new_status, note, changed_by)
    values (old.student_id, old.syllabus_item_id, old.status, null, null, public.current_instructor_id());
    return old;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.note is not distinct from old.note then
    return new;
  end if;
  insert into public.technique_progress_history (student_id, syllabus_item_id, previous_status, new_status, note, changed_by, changed_at)
  values (new.student_id, new.syllabus_item_id, case when tg_op = 'UPDATE' then old.status end, new.status, new.note,
    coalesce(new.updated_by, public.current_instructor_id()), new.updated_at);
  return new;
end;
$$;
revoke all on function public.record_technique_progress_history() from public, anon, authenticated;

create trigger technique_progress_history
after insert or update or delete on public.technique_progress
for each row execute function public.record_technique_progress_history();

-- Sets one technique's status and optional note for a student. A null status
-- with no note clears the record (back to Not assessed) and returns null.
-- Otherwise returns the saved row with the instructor who saved it. Saving the
-- same values again changes nothing.
create function public.set_technique_progress(
  target_student uuid, item text, new_status public.technique_status, new_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  instructor uuid := public.current_instructor_id();
  clean_note text := nullif(btrim(coalesce(new_note, '')), '');
  saved public.technique_progress;
begin
  if instructor is null then
    raise exception 'Only instructors can update technique progress' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = target_student) then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.syllabus_items where id = item) then
    raise exception 'Technique not found' using errcode = 'P0002';
  end if;
  if char_length(clean_note) > 1000 then
    raise exception 'Notes are limited to 1,000 characters' using errcode = '22023';
  end if;

  if new_status is null and clean_note is null then
    delete from public.technique_progress where student_id = target_student and syllabus_item_id = item;
    return null;
  end if;

  insert into public.technique_progress as tp (student_id, syllabus_item_id, status, note, updated_at, updated_by)
  values (target_student, item, new_status, clean_note, now(), instructor)
  on conflict (student_id, syllabus_item_id) do update
    set status = excluded.status, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    where (tp.status, tp.note) is distinct from (excluded.status, excluded.note)
  returning * into saved;
  if saved.id is null then
    select * into saved from public.technique_progress where student_id = target_student and syllabus_item_id = item;
  end if;

  return to_jsonb(saved) || jsonb_build_object('instructor',
    (select to_jsonb(i) from public.instructors i where i.id = saved.updated_by));
end;
$$;

revoke all on function public.set_technique_progress(uuid, text, public.technique_status, text) from public, anon;
grant execute on function public.set_technique_progress(uuid, text, public.technique_status, text) to authenticated;

commit;
