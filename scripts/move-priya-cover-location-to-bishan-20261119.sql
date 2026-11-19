-- One-time demo-location adjustment. Copy only Jamie's synthetic public
-- landmark, never a private address or a claimed home location.
begin;

do $$
declare updated integer;
begin
  update public.instructor_private_details target
  set address = 'Synthetic location: Bishan Community Centre (approximate, not a home address)',
    landmark = source.landmark, region = source.region,
    latitude = source.latitude, longitude = source.longitude,
    geocode_source = 'synthetic_public_landmark'
  from public.instructors priya, public.instructors jamie,
    public.instructor_private_details source
  where target.instructor_id = priya.id
    and priya.first_name = 'Priya' and priya.last_name = 'Rao'
    and priya.employment_type = 'part_time' and priya.user_id is not null
    and target.landmark = 'Bukit Timah Dojo'
    and target.address = 'Synthetic location: Bukit Timah Dojo (approximate, not a home address)'
    and target.geocode_source = 'synthetic_public_landmark'
    and source.instructor_id = jamie.id
    and jamie.first_name = 'Jamie' and jamie.last_name = 'Chen'
    and source.landmark = 'Bishan Community Centre'
    and source.address = 'Synthetic location: Bishan Community Centre (approximate, not a home address)'
    and source.geocode_source = 'synthetic_public_landmark'
    and source.latitude is not null and source.longitude is not null;
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'Expected exactly one synthetic instructor location to move; found %', updated;
  end if;
end;
$$;

commit;
