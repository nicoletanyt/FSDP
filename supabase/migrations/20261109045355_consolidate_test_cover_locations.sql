-- Consolidate test-only location metadata into private details. A synthetic
-- public landmark is never a real home address; keep address separate and NULL
-- for all migrated test positions. This migration intentionally clears the
-- existing Ben Ten address at the owner's request for full-time test coverage.
begin;

lock table public.instructor_private_details, public.instructor_cover_demo_locations
  in share row exclusive mode;

alter table public.instructor_private_details
  add column landmark text,
  add column region text check (region in ('west', 'north', 'central', 'east')),
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column geocode_source text,
  add column is_demo boolean not null default false,
  add column demo_location_created_at timestamptz,
  add constraint complete_demo_location check (
    not is_demo or (landmark is not null and region is not null
      and latitude is not null and longitude is not null
      and geocode_source is not null and demo_location_created_at is not null));

do $migrate$
declare
  ben_ten uuid;
  ben_two uuid;
  source_count integer;
  inserted_count integer;
begin
  select id into strict ben_ten from public.instructors
    where lower(email) = 'benten@example.test.com' and employment_type = 'full_time'
      and user_id is not null;
  select id into strict ben_two from public.instructors
    where lower(email) = 'bentwo@example.com' and user_id is not null;
  if not exists (select 1 from public.instructor_private_details
      where instructor_id = ben_ten and nullif(btrim(address), '') is not null)
    or not exists (select 1 from public.instructor_cover_demo_locations
      where instructor_id = ben_two and landmark = 'Beauty World Centre' and is_demo) then
    raise exception 'Test address or landmark changed; migration aborted';
  end if;
  select count(*) into source_count from public.instructor_cover_demo_locations;
  if source_count <> 10 or exists (
    select 1 from public.instructor_cover_demo_locations l
    join public.instructor_private_details p using (instructor_id)) then
    raise exception 'Demo location data changed or overlaps private records; migration aborted';
  end if;

  insert into public.instructor_private_details
    (instructor_id,landmark,region,latitude,longitude,geocode_source,is_demo,demo_location_created_at)
  select instructor_id,landmark,region,latitude,longitude,geocode_source,is_demo,created_at
    from public.instructor_cover_demo_locations;
  get diagnostics inserted_count = row_count;
  if inserted_count <> source_count then raise exception 'Not all demo locations migrated'; end if;

  update public.instructor_private_details target set
    address = null,
    landmark = source.landmark, region = source.region,
    latitude = source.latitude, longitude = source.longitude,
    geocode_source = source.geocode_source, is_demo = true,
    demo_location_created_at = clock_timestamp()
  from public.instructor_private_details source
  where target.instructor_id = ben_ten and source.instructor_id = ben_two
    and source.is_demo and source.landmark = 'Beauty World Centre';
  get diagnostics inserted_count = row_count;
  if inserted_count <> 1 then raise exception 'Full-time test location not set'; end if;
  if (select count(*) from public.instructor_private_details where is_demo) <> source_count + 1
    or (select count(*) from public.instructor_private_details
      where is_demo and nullif(btrim(address), '') is not null) <> 0 then
    raise exception 'Demo locations are incomplete or mixed with private addresses';
  end if;
end;
$migrate$;

comment on table public.instructor_private_details is
  'Private instructor data. address is an actual address; is_demo location fields are synthetic public landmarks, never residences.';
comment on column public.instructor_private_details.is_demo is
  'TRUE only for synthetic public-landmark test coordinates. Never authorize real class cover from these coordinates.';

-- The admin preview returns only coarse distance and eligibility, never an
-- address, landmark or coordinate. Existing user/address RLS is unchanged.
create or replace function public.preview_class_cover_candidates(target_event uuid)
returns table(instructor_id uuid, instructor_name text, distance_km numeric, eligibility text, location_basis text)
language plpgsql stable security definer set search_path = '' as $$
declare selected public.events%rowtype;
begin
  if (select auth.uid()) is null or not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into selected from public.events where id = target_event;
  if not found or selected.name <> '[Cover Test] Weekday 3 PM'
     or selected.event_type <> 'class' or selected.status <> 'scheduled'
     or selected.starts_at is null or selected.ends_at is null or selected.starts_at <= now()
     or not exists (select 1 from public.instructor_class_unavailability r
                    where r.event_id = target_event and r.status = 'open') then
    raise exception 'Future class needing cover required' using errcode = '22023';
  end if;
  return query
  with centre_location as (
    select g.latitude, g.longitude from public.centre_cover_geocodes g
    join public.centres c on c.id = g.centre_id
    where g.centre_id = selected.centre_id and g.address_snapshot = c.address and c.status = 'active'
  ), candidates as (
    select i.id, i.first_name, i.last_name, i.employment_type,
      case when p.is_demo and nullif(btrim(p.address), '') is null then p.latitude end as lat,
      case when p.is_demo and nullif(btrim(p.address), '') is null then p.longitude end as lon,
      (nullif(btrim(p.address), '') is not null) as has_private_address
    from public.instructors i
    join public.users u on u.id = i.user_id and u.role = 'instructor'
    left join public.instructor_private_details p on p.instructor_id = i.id
    where i.id is distinct from selected.instructor_id and i.email <> ''
  ), scored as (
    select c.*,
      case when c.lat is null then null
        else (select 2 * 6371 * asin(sqrt(least(1.0,
          power(sin(radians(c.lat - g.latitude) / 2), 2) +
          cos(radians(g.latitude)) * cos(radians(c.lat)) *
          power(sin(radians(c.lon - g.longitude) / 2), 2)))) from centre_location g)
      end as kilometres
    from candidates c
  )
  select s.id, concat_ws(' ', s.first_name, s.last_name)::text,
    round(s.kilometres::numeric, 1),
    case
      when s.has_private_address then 'location_unverified'
      when s.kilometres is null then 'location_unverified'
      when s.kilometres > 5 then 'outside_5_km'
      when s.employment_type is null then 'employment_unknown'
      when exists (select 1 from public.events conflict
        where conflict.instructor_id = s.id and conflict.id <> target_event
          and conflict.status = 'scheduled'
          and conflict.starts_at < selected.ends_at and conflict.ends_at > selected.starts_at)
        then 'schedule_conflict'
      when exists (select 1 from public.instructor_class_unavailability r
        join public.events e on e.id = r.event_id
        where r.instructor_id = s.id and r.status = 'open'
          and e.starts_at < selected.ends_at and e.ends_at > selected.starts_at)
        then 'unavailability_conflict'
      when s.employment_type = 'part_time' and not exists (
        select 1 from public.instructor_availability a where a.instructor_id = s.id
          and a.date = (selected.starts_at at time zone 'Asia/Singapore')::date
          and ((a.date + a.start_time) at time zone 'Asia/Singapore') <= selected.starts_at
          and ((a.date + a.end_time) at time zone 'Asia/Singapore') >= selected.ends_at)
        then 'no_positive_availability'
      else 'demo_only_match'
    end::text,
    case when s.kilometres is null then 'unverified' else 'synthetic_public_landmark' end::text
  from scored s order by s.kilometres nulls last, s.id;
end;
$$;

-- Test-only linked recipients may use @example.com or @example.test.com.
-- The exact class marker and every eligibility check remain mandatory.
create or replace function public.reserve_class_cover_test_invitation(target_event uuid,target_instructor uuid)
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
  if not found or lower(candidate.email) !~ '^[^@]+@example([.]test)?[.]com$'
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

create or replace function public.get_class_cover_test_invitation(target_invitation uuid)
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
    and lower(i.email) ~ '^[^@]+@example([.]test)?[.]com$'
  join public.events e on e.id = inv.event_id and e.name = '[Cover Test] Weekday 3 PM'
    and e.event_type = 'class'
  join public.centres c on c.id = e.centre_id
  join public.instructor_class_unavailability r on r.event_id = e.id
  where inv.id = target_invitation;
  return result;
end;
$$;

create or replace function public.decide_class_cover_test_invitation(target_invitation uuid, response text)
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
  location public.instructor_private_details%rowtype;
  kilometres double precision;
begin
  if response not in ('accept','decline') or response is null then
    raise exception 'Invalid response' using errcode = '22023'; end if;
  if caller is null or not exists (select 1 from public.users where id = caller and role = 'instructor') then
    raise exception 'Instructor access required' using errcode = '42501'; end if;
  select id into owner_id from public.instructors where user_id = caller;
  if owner_id is null then raise exception 'Linked instructor required' using errcode = '42501'; end if;

  select event_id into target_event from public.class_cover_test_invitations
    where id = target_invitation and instructor_id = owner_id;
  if target_event is null then raise exception 'Invitation not found for this account' using errcode = '42501'; end if;
  select * into selected from public.events where id = target_event for update;
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
  if candidate.user_id is distinct from caller or lower(candidate.email) !~ '^[^@]+@example([.]test)?[.]com$'
    or candidate.employment_type not in ('full_time','part_time') or candidate.employment_type is null
    or selected.instructor_id = owner_id then return 'ineligible'; end if;

  -- A public test landmark can authorize only the exact named test class.
  -- A subsequently entered real address invalidates the synthetic location.
  select * into centre from public.centres where id = selected.centre_id;
  select * into geocode from public.centre_cover_geocodes where centre_id = selected.centre_id;
  select * into location from public.instructor_private_details where instructor_id = owner_id;
  if centre.status is distinct from 'active' or geocode.address_snapshot is distinct from centre.address
     or location.is_demo is distinct from true or location.instructor_id is null
     or nullif(btrim(location.address), '') is not null then return 'ineligible'; end if;
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

-- All dependencies have been replaced. Remove only this source table; do not
-- touch the centre geocode cache, class events, requests, or invitations.
drop table public.instructor_cover_demo_locations;
commit;
