-- Phase 5 remains test-only. An invitation ID is a locator, never a bearer token.
alter table public.class_cover_test_invitations
  add column decision text not null default 'pending'
    check (decision in ('pending', 'declined', 'accepted')),
  add column decided_at timestamptz,
  add constraint class_cover_test_decision_time check ((decision = 'pending') = (decided_at is null));

-- Expose only the invited instructor's class details; no email copy, locations,
-- other recipients, or admin diagnostics are returned.
create function public.get_class_cover_test_invitation(target_invitation uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'instructor'
  ) then raise exception 'Instructor access required' using errcode = '42501'; end if;

  select jsonb_build_object(
    'id', inv.id, 'class_name', e.name, 'starts_at', e.starts_at,
    'ends_at', e.ends_at, 'centre_name', c.name,
    'decision', inv.decision,
    'state', case when inv.decision = 'accepted' then 'accepted'
      when inv.decision = 'declined' then 'declined'
      when inv.status <> 'accepted' then 'not_sent'
      when e.instructor_id is distinct from r.instructor_id or r.status = 'covered' then 'covered'
      when r.status <> 'open' or e.status <> 'scheduled' or e.starts_at <= now() then 'closed'
      else 'open' end)
    into result
  from public.class_cover_test_invitations inv
  join public.instructors i on i.id = inv.instructor_id and i.user_id = auth.uid()
    and lower(i.email) ~ '^[^@]+@example[.]com$'
  join public.events e on e.id = inv.event_id and e.name = '[Cover Test] Weekday 3 PM'
    and e.event_type = 'class'
  join public.centres c on c.id = e.centre_id
  join public.instructor_class_unavailability r on r.event_id = e.id
  where inv.id = target_invitation;
  return result;
end;
$$;
revoke all on function public.get_class_cover_test_invitation(uuid) from public, anon;
grant execute on function public.get_class_cover_test_invitation(uuid) to authenticated;

create function public.decide_class_cover_test_invitation(target_invitation uuid, response text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
  target_event uuid;
  selected public.events%rowtype;
  invited public.class_cover_test_invitations%rowtype;
  request public.instructor_class_unavailability%rowtype;
  candidate public.instructors%rowtype;
  centre public.centres%rowtype;
  geocode public.centre_cover_geocodes%rowtype;
  location public.instructor_cover_demo_locations%rowtype;
  private_address text;
  kilometres double precision;
begin
  if response not in ('accept','decline') or response is null then
    raise exception 'Invalid response' using errcode = '22023'; end if;
  if caller is null or not exists (select 1 from public.users where id = caller and role = 'instructor') then
    raise exception 'Instructor access required' using errcode = '42501'; end if;
  select id into owner_id from public.instructors where user_id = caller;
  if owner_id is null then raise exception 'Linked instructor required' using errcode = '42501'; end if;

  -- Read only the locator before locking; verify ownership before revealing any
  -- class details. All decisions on the same class serialize on its event row.
  select event_id into target_event from public.class_cover_test_invitations
    where id = target_invitation and instructor_id = owner_id;
  if target_event is null then raise exception 'Invitation not found for this account' using errcode = '42501'; end if;
  select * into selected from public.events where id = target_event for update;
  -- Serialize this instructor's responses across different classes too, so a
  -- newly accepted class cannot be missed by the schedule-conflict check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 4242));
  select * into invited from public.class_cover_test_invitations where id = target_invitation for update;
  if invited.instructor_id is distinct from owner_id or selected.name <> '[Cover Test] Weekday 3 PM'
    or selected.event_type <> 'class' then
    raise exception 'Test invitation unavailable' using errcode = '42501'; end if;
  if invited.decision = 'accepted' then return 'accepted'; end if;
  if invited.decision = 'declined' then return 'declined'; end if;
  if invited.status <> 'accepted' then return 'not_sent'; end if;

  select * into request from public.instructor_class_unavailability
    where event_id = target_event for update;
  if not found then return 'closed'; end if;
  if selected.instructor_id is distinct from request.instructor_id or request.status = 'covered' then
    return 'covered'; end if;
  if request.status <> 'open' or selected.status <> 'scheduled'
     or selected.starts_at is null or selected.ends_at is null
     or selected.ends_at <= selected.starts_at or selected.starts_at <= clock_timestamp() then
    return 'closed'; end if;

  if response = 'decline' then
    update public.class_cover_test_invitations set decision = 'declined', decided_at = clock_timestamp()
      where id = target_invitation;
    return 'declined';
  end if;

  select * into candidate from public.instructors where id = owner_id;
  if candidate.user_id is distinct from caller or lower(candidate.email) !~ '^[^@]+@example[.]com$'
    or candidate.employment_type not in ('full_time','part_time') or candidate.employment_type is null
    or selected.instructor_id = owner_id then return 'ineligible'; end if;

  -- Synthetic landmarks are allowed solely for this named test class. A real
  -- private address must never be silently replaced by a demo location.
  select * into centre from public.centres where id = selected.centre_id;
  select * into geocode from public.centre_cover_geocodes where centre_id = selected.centre_id;
  select * into location from public.instructor_cover_demo_locations where instructor_id = owner_id;
  select address into private_address from public.instructor_private_details where instructor_id = owner_id;
  if centre.status is distinct from 'active' or geocode.address_snapshot is distinct from centre.address
     or location.is_demo is distinct from true or location.instructor_id is null
     or nullif(btrim(private_address), '') is not null then return 'ineligible'; end if;
  kilometres := 2 * 6371 * asin(sqrt(least(1.0,
    power(sin(radians(location.latitude - geocode.latitude) / 2), 2) +
    cos(radians(geocode.latitude)) * cos(radians(location.latitude)) *
    power(sin(radians(location.longitude - geocode.longitude) / 2), 2))));
  if kilometres is null or kilometres > 5 then return 'ineligible'; end if;

  if exists (select 1 from public.events e where e.instructor_id = owner_id
      and e.id <> target_event and e.status = 'scheduled'
      and e.starts_at < selected.ends_at and e.ends_at > selected.starts_at)
    or exists (select 1 from public.instructor_class_unavailability r
      join public.events e on e.id = r.event_id
      where r.instructor_id = owner_id and r.status = 'open'
        and e.starts_at < selected.ends_at and e.ends_at > selected.starts_at)
    or (candidate.employment_type = 'part_time' and not exists (
      select 1 from public.instructor_availability a where a.instructor_id = owner_id
        and a.date = (selected.starts_at at time zone 'Asia/Singapore')::date
        and ((a.date + a.start_time) at time zone 'Asia/Singapore') <= selected.starts_at
        and ((a.date + a.end_time) at time zone 'Asia/Singapore') >= selected.ends_at)) then
    return 'ineligible'; end if;

  update public.events set instructor_id = owner_id where id = target_event;
  update public.instructor_class_unavailability set status = 'covered' where id = request.id;
  update public.class_cover_test_invitations set decision = 'accepted', decided_at = clock_timestamp()
    where id = target_invitation;
  return 'accepted';
end;
$$;
revoke all on function public.decide_class_cover_test_invitation(uuid,text) from public, anon;
grant execute on function public.decide_class_cover_test_invitation(uuid,text) to authenticated;
