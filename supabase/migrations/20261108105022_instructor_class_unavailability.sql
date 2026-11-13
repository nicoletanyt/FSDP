-- A class-cover request is separate from positive availability slots.
create table public.instructor_class_unavailability (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete restrict,
  instructor_id uuid not null references public.instructors(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'covered', 'cancelled')),
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sending', 'accepted', 'failed')),
  notification_attempted_at timestamptz,
  notification_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index instructor_class_unavailability_user_idx on public.instructor_class_unavailability(user_id, created_at desc);
alter table public.instructor_class_unavailability enable row level security;
revoke all on public.instructor_class_unavailability from public, anon, authenticated;
grant select on public.instructor_class_unavailability to authenticated;
grant select, insert, update on public.instructor_class_unavailability to service_role;
create policy "Admins see class-cover requests" on public.instructor_class_unavailability
  for select to authenticated using ((select public.is_administrator()));
create policy "Instructors see their own class-cover requests" on public.instructor_class_unavailability
  for select to authenticated using (user_id = (select auth.uid()) and (select public.current_user_role()) = 'instructor');

create function public.report_instructor_class_unavailability(target_event uuid)
returns public.instructor_class_unavailability language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  owner uuid;
  selected public.events%rowtype;
  saved public.instructor_class_unavailability%rowtype;
begin
  if caller is null or not exists (select 1 from public.users where id = caller and role = 'instructor') then
    raise exception 'Instructor access required' using errcode = '42501';
  end if;
  select id into owner from public.instructors where user_id = caller;
  if owner is null then raise exception 'Linked instructor required' using errcode = '42501'; end if;
  select * into selected from public.events where id = target_event for update;
  if not found or selected.instructor_id is distinct from owner or selected.event_type <> 'class' then
    raise exception 'Assigned class not found' using errcode = '42501';
  end if;
  select * into saved from public.instructor_class_unavailability where event_id = target_event;
  if found then
    if saved.user_id is distinct from caller or saved.status <> 'open' then
      raise exception 'This class already has a cover request' using errcode = '23505';
    end if;
    return saved; -- Safe retry after an ambiguous response; never create a second request.
  end if;
  if selected.status <> 'scheduled' or selected.starts_at is null or selected.ends_at is null
    or selected.starts_at <= clock_timestamp() then
    raise exception 'Only future scheduled classes can be reported' using errcode = '22023';
  end if;
  insert into public.instructor_class_unavailability(event_id,instructor_id,user_id)
    values (target_event,owner,caller) returning * into saved;
  return saved;
end;
$$;
revoke all on function public.report_instructor_class_unavailability(uuid) from public, anon;
grant execute on function public.report_instructor_class_unavailability(uuid) to authenticated;
