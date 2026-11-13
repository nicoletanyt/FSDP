begin;

-- Examiner eligibility is an administrator-managed flag, independent of grade and title.
alter table public.instructors add column is_examiner boolean not null default false;
comment on column public.instructors.is_examiner is
  'Whether the instructor may sit on grading panels. Set by administrators; independent of grade_id and instructor_title.';

-- The examiners assigned to one grading event. At most one is the chief examiner.
create table public.grading_panel_members (
  grading_event_id uuid not null references public.gradings(event_id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  is_chief boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (grading_event_id, instructor_id)
);
create unique index grading_panel_members_one_chief_idx
  on public.grading_panel_members (grading_event_id) where is_chief;
create index grading_panel_members_instructor_idx on public.grading_panel_members (instructor_id);
comment on table public.grading_panel_members is
  'Examiners on a grading event panel. Only panel members can create or change grading batches, reviews and technique sign-offs for that grading.';

alter table public.grading_panel_members enable row level security;
revoke all on public.grading_panel_members from public, anon, authenticated;
grant select, insert, update, delete on public.grading_panel_members to authenticated;
grant all on public.grading_panel_members to service_role;

create policy "Administrators and instructors read grading panels" on public.grading_panel_members
for select to authenticated
using ((select public.is_administrator()) or (select public.current_instructor_id()) is not null);
create policy "Administrators manage grading panels" on public.grading_panel_members
for all to authenticated
using ((select public.is_administrator())) with check ((select public.is_administrator()));

-- Panel members must be flagged as examiners.
create function public.require_panel_examiner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.instructors where id = new.instructor_id and is_examiner) then
    raise exception 'Only examiners can sit on a grading panel' using errcode = 'PGP02';
  end if;
  return new;
end;
$$;
create trigger grading_panel_members_require_examiner
before insert or update of instructor_id on public.grading_panel_members
for each row execute function public.require_panel_examiner();

-- An examiner cannot lose the flag while sitting on a scheduled grading's panel.
create function public.keep_scheduled_panel_examiners()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_examiner and not new.is_examiner and exists (
    select 1 from public.grading_panel_members m
    join public.events e on e.id = m.grading_event_id
    where m.instructor_id = new.id and e.status = 'scheduled'
  ) then
    raise exception 'Remove this instructor from scheduled grading panels first' using errcode = 'PGP03';
  end if;
  return new;
end;
$$;
create trigger instructors_keep_scheduled_panel_examiners
before update of is_examiner on public.instructors
for each row execute function public.keep_scheduled_panel_examiners();

-- Shared enforcement for every table a grading writes to: the acting instructor
-- (the column named by the trigger argument) must be on that grading's panel.
-- Rows without an event or instructor are not grading work (e.g. class-time
-- sign-offs, or ON DELETE SET NULL cleanups).
create function public.enforce_grading_panel()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_event uuid := (to_jsonb(new) ->> 'event_id')::uuid;
  target_instructor uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if target_event is null or target_instructor is null then return new; end if;
  if not exists (select 1 from public.grading_panel_members
    where grading_event_id = target_event and instructor_id = target_instructor) then
    raise exception 'Only examiners on this grading''s panel can grade it' using errcode = 'PGP01';
  end if;
  return new;
end;
$$;

-- Backfill from existing grading activity so current work keeps working: the
-- event's assessing instructor becomes chief, and anyone who already graded the
-- event joins its panel. Everyone backfilled is flagged as an examiner.
create temporary table panel_backfill (grading_event_id uuid, instructor_id uuid, is_chief boolean) on commit drop;
insert into panel_backfill
select g.event_id, e.instructor_id, true
from public.gradings g join public.events e on e.id = g.event_id
where e.instructor_id is not null;

-- Guarded: these tables and columns come from migrations that not every branch
-- or offline test schema carries.
do $$
begin
  if to_regclass('public.grading_batches') is not null then
    execute 'insert into pg_temp.panel_backfill select event_id, instructor_id, false from public.grading_batches';
  end if;
  if to_regclass('public.instructor_grading_reviews') is not null then
    execute 'insert into pg_temp.panel_backfill select event_id, instructor_id, false
      from public.instructor_grading_reviews where instructor_id is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'technique_sign_offs' and column_name = 'event_id') then
    execute 'insert into pg_temp.panel_backfill select event_id, signed_off_by, false
      from public.technique_sign_offs where event_id is not null and signed_off_by is not null';
  end if;
end;
$$;

update public.instructors set is_examiner = true
where id in (select instructor_id from panel_backfill);

insert into public.grading_panel_members (grading_event_id, instructor_id, is_chief)
select grading_event_id, instructor_id, bool_or(is_chief)
from panel_backfill group by grading_event_id, instructor_id
on conflict do nothing;

do $$
begin
  if to_regclass('public.grading_batches') is not null then
    execute 'create trigger grading_batches_enforce_panel
      before insert or update on public.grading_batches
      for each row execute function public.enforce_grading_panel(''instructor_id'')';
  end if;
  if to_regclass('public.instructor_grading_reviews') is not null then
    execute 'create trigger instructor_grading_reviews_enforce_panel
      before insert or update on public.instructor_grading_reviews
      for each row execute function public.enforce_grading_panel(''instructor_id'')';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'technique_sign_offs' and column_name = 'event_id') then
    execute 'create trigger technique_sign_offs_enforce_panel
      before insert or update on public.technique_sign_offs
      for each row execute function public.enforce_grading_panel(''signed_off_by'')';
  end if;
end;
$$;

-- Atomically replace a grading's panel. Runs as the caller, so RLS limits it to
-- administrators; the explicit check gives a clear error first.
create function public.set_grading_panel(target_event uuid, examiner_ids uuid[], chief_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  members uuid[] := coalesce((select array_agg(distinct id) from unnest(examiner_ids) as id where id is not null), '{}');
begin
  if not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.gradings where event_id = target_event) then
    raise exception 'Grading not found' using errcode = '22023';
  end if;
  if chief_id is not null and not chief_id = any(members) then
    raise exception 'The chief examiner must be on the panel' using errcode = 'PGP04';
  end if;
  update public.grading_panel_members set is_chief = false
    where grading_event_id = target_event and is_chief;
  delete from public.grading_panel_members
    where grading_event_id = target_event and not instructor_id = any(members);
  insert into public.grading_panel_members (grading_event_id, instructor_id, is_chief)
  select target_event, id, id is not distinct from chief_id from unnest(members) as id
  on conflict (grading_event_id, instructor_id) do update set is_chief = excluded.is_chief;
  return coalesce((select jsonb_agg(jsonb_build_object('instructor_id', instructor_id, 'is_chief', is_chief)
      order by is_chief desc, added_at, instructor_id)
    from public.grading_panel_members where grading_event_id = target_event), '[]'::jsonb);
end;
$$;
revoke all on function public.set_grading_panel(uuid, uuid[], uuid) from public, anon;
grant execute on function public.set_grading_panel(uuid, uuid[], uuid) to authenticated;

-- Provisioning also reads the trusted examiner flag.
create or replace function public.create_linked_instructor_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'instructor'::public.user_role then
    insert into public.instructors(user_id, first_name, last_name, email, grade_id, instructor_title, is_examiner)
    values (new.id, new.first_name, new.last_name, new.email,
      (select nullif(raw_app_meta_data ->> 'instructor_grade_id', '') from auth.users where id = new.id),
      coalesce((select nullif(raw_app_meta_data ->> 'instructor_title', '') from auth.users where id = new.id), 'none'),
      coalesce((select (raw_app_meta_data ->> 'instructor_is_examiner')::boolean from auth.users where id = new.id), false))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

commit;
