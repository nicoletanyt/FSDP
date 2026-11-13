-- Synthetic public landmarks are NOT home addresses. Never copy them into
-- instructor_private_details or use them to authorize real invitations.
create table public.instructor_cover_demo_locations (
  instructor_id uuid primary key references public.instructors(id) on delete cascade,
  landmark text not null,
  region text not null check (region in ('west', 'north', 'central', 'east')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  geocode_source text not null default 'OpenStreetMap contributors / Nominatim',
  is_demo boolean not null default true check (is_demo),
  created_at timestamptz not null default now()
);
create table public.centre_cover_geocodes (
  centre_id uuid primary key references public.centres(id) on delete cascade,
  address_snapshot text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  geocode_source text not null default 'OpenStreetMap contributors / Nominatim',
  created_at timestamptz not null default now()
);
alter table public.instructor_cover_demo_locations enable row level security;
alter table public.centre_cover_geocodes enable row level security;
revoke all on public.instructor_cover_demo_locations, public.centre_cover_geocodes from public, anon, authenticated;
grant select, insert, update, delete on public.instructor_cover_demo_locations, public.centre_cover_geocodes to service_role;

-- A private, read-only admin projection. The only location data returned is
-- an approximate distance, and demo-only matches are never marked eligible
-- for real invitations. Re-evaluate every condition when sending/accepting.
create function public.preview_class_cover_candidates(target_event uuid)
returns table(instructor_id uuid, instructor_name text, distance_km numeric, eligibility text, location_basis text)
language plpgsql stable security definer set search_path = '' as $$
declare selected public.events%rowtype;
begin
  if (select auth.uid()) is null or not (select public.is_administrator()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into selected from public.events where id = target_event;
  if not found or selected.event_type <> 'class' or selected.status <> 'scheduled'
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
      case when p.address is null or btrim(p.address) = '' then l.latitude end as lat,
      case when p.address is null or btrim(p.address) = '' then l.longitude end as lon,
      (p.address is not null and btrim(p.address) <> '') as has_private_address
    from public.instructors i
    join public.users u on u.id = i.user_id and u.role = 'instructor'
    left join public.instructor_private_details p on p.instructor_id = i.id
    left join public.instructor_cover_demo_locations l on l.instructor_id = i.id and l.is_demo
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
revoke all on function public.preview_class_cover_candidates(uuid) from public, anon;
grant execute on function public.preview_class_cover_candidates(uuid) to authenticated;
comment on function public.preview_class_cover_candidates(uuid) is
  'Read-only admin test shortlist. demo_only_match is NOT authorization to send a real invitation.';
