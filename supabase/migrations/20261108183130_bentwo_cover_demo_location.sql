-- Reuse an already cached public landmark near Bukit Timah Dojo for testing.
-- This is NOT a home address and must not authorize a real cover invitation.
insert into public.instructor_cover_demo_locations
  (instructor_id, landmark, region, latitude, longitude, geocode_source)
select target.id, 'Beauty World Centre', 'central', cached.latitude, cached.longitude, cached.geocode_source
from public.instructors target
join public.users account on account.id = target.user_id and account.role = 'instructor'
join public.instructors reference on reference.email = 'bobtan@gmail.com'
join public.instructor_cover_demo_locations cached on cached.instructor_id = reference.id
  and cached.landmark = 'Beauty World Centre' and cached.is_demo
left join public.instructor_private_details private on private.instructor_id = target.id
where lower(target.email) = 'bentwo@example.com'
  and target.employment_type = 'part_time'
  and nullif(btrim(private.address), '') is null
on conflict (instructor_id) do nothing;
