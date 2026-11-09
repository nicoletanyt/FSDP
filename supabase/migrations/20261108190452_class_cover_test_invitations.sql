-- A test invitation is a receipt, NOT an acceptance or a class assignment.
-- No recipient can be sent a second invitation for the same class automatically.
create table public.class_cover_test_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  instructor_id uuid not null references public.instructors(id) on delete restrict,
  requested_by uuid not null references public.users(id) on delete restrict,
  status text not null default 'sending' check (status in ('sending','accepted','failed','uncertain')),
  email_subject text,
  email_body text,
  provider_http_status integer check (provider_http_status between 100 and 599),
  failure_reason text check (length(failure_reason) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique(event_id,instructor_id)
);
create index class_cover_test_invitations_instructor_idx on public.class_cover_test_invitations(instructor_id);
alter table public.class_cover_test_invitations enable row level security;
revoke all on public.class_cover_test_invitations from public,anon,authenticated;
grant select on public.class_cover_test_invitations to authenticated;
grant select,insert,update on public.class_cover_test_invitations to service_role;
create policy "Admins read test cover invitations" on public.class_cover_test_invitations
  for select to authenticated using ((select public.is_administrator()));

create function public.reserve_class_cover_test_invitation(target_event uuid,target_instructor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  selected public.events%rowtype;
  candidate public.instructors%rowtype;
  invitation_id uuid;
begin
  if caller is null or not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into selected from public.events where id=target_event for update;
  if not found or selected.name <> '[Cover Test] Weekday 3 PM'
    or selected.event_type <> 'class' or selected.status <> 'scheduled'
    or selected.starts_at is null or selected.starts_at <= clock_timestamp()
    or selected.ends_at is null
    or not exists (select 1 from public.instructor_class_unavailability r
      where r.event_id=target_event and r.status='open') then
    raise exception 'Future test class needing cover required' using errcode = '22023';
  end if;
  select * into candidate from public.instructors where id=target_instructor;
  if not found or lower(candidate.email) !~ '^[^@]+@example[.]com$'
    or candidate.user_id is null
    or not exists (select 1 from public.preview_class_cover_candidates(target_event) p
      where p.instructor_id=target_instructor and p.eligibility='demo_only_match') then
    raise exception 'Test recipient is not eligible' using errcode = '22023';
  end if;
  if exists(select 1 from public.class_cover_test_invitations
            where event_id=target_event and instructor_id=target_instructor) then
    raise exception 'Invitation already recorded; do not resend' using errcode = '23505';
  end if;
  insert into public.class_cover_test_invitations(event_id,instructor_id,requested_by)
    values (target_event,target_instructor,caller) returning id into invitation_id;
  return invitation_id;
end;
$$;
revoke all on function public.reserve_class_cover_test_invitation(uuid,uuid) from public,anon;
grant execute on function public.reserve_class_cover_test_invitation(uuid,uuid) to authenticated;
