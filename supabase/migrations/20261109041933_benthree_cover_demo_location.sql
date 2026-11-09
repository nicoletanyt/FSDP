-- Test-only public landmark, not a residence. Reuse the existing cached
-- Beauty World Centre coordinates; never populate a private address.
insert into public.instructor_cover_demo_locations
  (instructor_id, landmark, region, latitude, longitude, geocode_source)
select target.id, cached.landmark, cached.region,
  cached.latitude, cached.longitude, cached.geocode_source
from public.instructors target
join public.users account on account.id = target.user_id and account.role = 'instructor'
join public.instructors reference on lower(reference.email) = 'bentwo@example.com'
join public.instructor_cover_demo_locations cached on cached.instructor_id = reference.id
  and cached.landmark = 'Beauty World Centre' and cached.is_demo
left join public.instructor_private_details private on private.instructor_id = target.id
where lower(target.email) = 'benthree@example.com'
  and target.employment_type = 'part_time'
  and nullif(btrim(private.address), '') is null
on conflict (instructor_id) do nothing;
