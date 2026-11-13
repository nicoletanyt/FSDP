-- One-time, cached Nominatim results for public locations only. OSM data:
-- © OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright
-- Never seed private/home addresses or treat these landmarks as residences.
insert into public.instructor_cover_demo_locations
  (instructor_id, landmark, region, latitude, longitude)
select i.id, sample.landmark, sample.region, sample.latitude, sample.longitude
from (values
  ('alex.morgan@example.com', 'Jurong East MRT', 'west', 1.3330895, 103.7423097),
  ('ananya.nair@example.test', 'Clementi Community Club', 'west', 1.3188743, 103.7680959),
  ('benone@example.com', 'Woodlands MRT', 'north', 1.4369830, 103.7865695),
  ('hiroshi.sato@example.test', 'Yishun MRT', 'north', 1.4295174, 103.8349632),
  ('bobtan@gmail.com', 'Beauty World Centre', 'central', 1.3423590, 103.7764335),
  ('jamie.chen@example.com', 'Bishan Community Centre', 'central', 1.3497540, 103.8507936),
  ('kenji.mori@example.test', 'Tampines MRT', 'east', 1.3530295, 103.9453532),
  ('weiming.tan@example.test', 'Bedok Mall', 'east', 1.3248627, 103.9292277)
) as sample(email, landmark, region, latitude, longitude)
join public.instructors i on lower(i.email) = sample.email
left join public.instructor_private_details p on p.instructor_id = i.id
where nullif(btrim(p.address), '') is null
on conflict (instructor_id) do nothing;

insert into public.centre_cover_geocodes(centre_id, address_snapshot, latitude, longitude)
select c.id, c.address, 1.3404934, 103.7717548
from public.centres c
where c.name = 'Bukit Timah Dojo'
  and c.address = 'Bukit Timah Community Club, 20 Toh Yi Dr, Singapore 596569'
on conflict (centre_id) do nothing;
