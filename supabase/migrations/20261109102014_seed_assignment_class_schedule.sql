-- Assignment timetable, based on the published weekly ASK schedule.
-- Source: https://aikidoshinjukai.com.sg/class-schedules/
-- Source: https://aikidoshinjukai.com.sg/our-dojos/
-- Keep existing events and enrolments. Set a 20-seat assignment capacity
-- only where neither the class nor its centre already has a limit.

create or replace function student_calendar_private.schedule()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with viewer as (
    select s.id, s.membership_status, g.label as grade
    from public.students s
    left join public.grades g on g.id = s.current_grade_id
    where s.user_id = (select auth.uid())
      and (select public.current_user_role()) = 'student'
  ), sessions as (
    select e.id, e.name, e.starts_at, e.ends_at, e.status,
      c.class_type_id, t.label as class_type, t.description,
      ce.name as centre, coalesce(c.booking_capacity, ce.capacity) as capacity,
      nullif(concat_ws(' ', i.first_name, i.last_name), '') as instructor,
      (select count(*) from public.event_students roster where roster.event_id = e.id) as occupied,
      es.student_id is not null as booked, es.attendance_status,
      es.moved_from_event_id, w.student_id is not null as waitlisted
    from public.events e
    join public.classes c on c.event_id = e.id
    join public.class_types t on t.id = c.class_type_id
    join public.centres ce on ce.id = e.centre_id
    left join public.instructors i on i.id = e.instructor_id
    left join public.event_students es on es.event_id = e.id and es.student_id = (select id from viewer)
    left join public.class_waitlist w on w.event_id = e.id and w.student_id = (select id from viewer)
    where (select public.current_user_role()) = 'student'
      and (es.student_id is not null or w.student_id is not null
        or (e.status = 'scheduled' and e.starts_at > now() and e.starts_at <= now() + interval '120 days'))
  )
  select jsonb_build_object(
    'grade', (select grade from viewer),
    'linked', exists(select 1 from viewer),
    'active', coalesce((select membership_status = 'active' from viewer), false),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at, s.id) from sessions s), '[]'::jsonb)
  );
$$;

with timetable(centre_name, class_label, weekday, start_time, end_time, instructor_name) as (
  values
    ('ASK Headquarters Dojo', 'Adults', 1, time '07:15', time '08:15', 'Aloyseus Lee'),
    ('ASK Headquarters Dojo', 'Adults', 1, time '15:00', time '16:00', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Children Juniors', 1, time '17:00', time '18:00', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 1, time '18:00', time '19:00', 'Mark Lim'),
    ('ASK Headquarters Dojo', 'Adults', 1, time '19:15', time '20:15', 'Mark Lim'),
    ('ASK Headquarters Dojo', 'Adults', 1, time '20:30', time '21:30', 'Alexander Lee'),
    ('Our Tampines Hub', 'Children''s class', 1, time '19:30', time '20:30', null),
    ('Our Tampines Hub', 'Adults', 1, time '20:30', time '21:30', null),
    ('Siglap South Dojo', 'Mixed/Family', 1, time '20:00', time '21:15', null),
    ('ActiveSG Bishan Dojo', 'Mixed/Family', 1, time '18:00', time '19:00', null),
    ('EtonHouse Pre-School Robertson Walk', 'Children''s class', 1, time '15:00', time '17:00', null),
    ('Punggol 21 Dojo', 'Mixed/Family', 1, time '19:30', time '20:30', null),
    ('ASK Headquarters Dojo', 'Adults', 2, time '07:15', time '08:15', 'Philip Lee'),
    ('ASK Headquarters Dojo', 'Children Beginners', 2, time '17:00', time '18:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 2, time '18:00', time '19:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Adults', 2, time '18:00', time '19:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Adults', 2, time '19:15', time '20:15', 'James Tan'),
    ('ASK Headquarters Dojo', 'Weapons', 2, time '20:30', time '21:30', 'Robin Tan'),
    ('Thomson Dojo', 'Mixed/Family', 2, time '19:00', time '20:15', null),
    ('AGORA Colearning', 'Children''s class', 2, time '16:30', time '17:30', null),
    ('Tanjong Pagar Dojo', 'Children''s class', 2, time '20:00', time '21:00', null),
    ('Tanjong Pagar Dojo', 'Adults', 2, time '20:00', time '21:15', null),
    ('ASK Headquarters Dojo', 'Adults', 3, time '10:00', time '11:00', 'Elaine Ong'),
    ('ASK Headquarters Dojo', 'Adults', 3, time '11:00', time '12:00', 'Elaine Ong'),
    ('ASK Headquarters Dojo', 'Adults', 3, time '12:15', time '13:15', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Children Beginners', 3, time '16:00', time '17:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 3, time '17:00', time '18:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Adults', 3, time '18:00', time '19:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Adults', 3, time '19:15', time '20:15', 'Aloyseus Lee'),
    ('ASK Headquarters Dojo', 'Advanced', 3, time '20:30', time '21:30', 'Philip Lee'),
    ('Etonhouse International School Dojo', 'Children''s class', 3, time '15:30', time '16:30', null),
    ('Rivervale Dojo', 'Adults', 3, time '20:00', time '21:00', null),
    ('ASK Headquarters Dojo', 'Adults', 4, time '07:15', time '08:15', 'Alexander Lee'),
    ('ASK Headquarters Dojo', 'Adults', 4, time '11:00', time '12:00', 'Alexander Lee'),
    ('ASK Headquarters Dojo', 'Adults', 4, time '12:15', time '13:15', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Children Beginners', 4, time '16:00', time '17:00', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Children Beginners', 4, time '17:00', time '18:00', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 4, time '18:00', time '19:00', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 4, time '19:15', time '20:15', 'Philip Lee'),
    ('ASK Headquarters Dojo', 'Intermediate', 4, time '20:30', time '21:30', 'Bob Tan'),
    ('Paya Lebar Kovan Dojo', 'Children''s class', 4, time '20:00', time '21:00', null),
    ('Paya Lebar Kovan Dojo', 'Adults', 4, time '20:00', time '21:15', null),
    ('ActiveSG Bishan Dojo', 'Mixed/Family', 4, time '19:30', time '20:30', null),
    ('Alexandra Retail Centre Dojo', 'Adults', 4, time '12:00', time '13:00', null),
    ('Senja-Cashew Community Club Dojo', 'Children''s class', 4, time '20:00', time '21:00', null),
    ('Senja-Cashew Community Club Dojo', 'Adults', 4, time '20:00', time '21:15', null),
    ('ASK Headquarters Dojo', 'Adults', 5, time '11:00', time '12:00', 'Tan Kok Hiang'),
    ('ASK Headquarters Dojo', 'Adults', 5, time '12:15', time '13:15', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Children Beginners', 5, time '16:00', time '17:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 5, time '17:00', time '18:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 5, time '18:00', time '19:00', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 5, time '18:00', time '19:00', 'Elaine Ong'),
    ('ASK Headquarters Dojo', 'Adults', 5, time '19:15', time '20:15', 'Elaine Ong'),
    ('ASK Headquarters Dojo', 'Adults', 5, time '20:30', time '21:30', 'Robin Tan'),
    ('AGORA Colearning', 'Children''s class', 5, time '15:15', time '16:15', null),
    ('EtonHouse International School Sentosa', 'Children''s class', 5, time '15:00', time '16:00', null),
    ('The Frontier Dojo', 'Children''s class', 5, time '19:00', time '20:00', null),
    ('The Frontier Dojo', 'Adults', 5, time '20:00', time '21:15', null),
    ('Republic Polytechnic', 'Mixed/Family', 5, time '15:00', time '16:30', null),
    ('ASK Headquarters Dojo', 'Adults', 6, time '08:00', time '09:00', 'Philip Lee'),
    ('ASK Headquarters Dojo', 'Children Beginners', 6, time '09:15', time '10:15', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Adults', 6, time '09:15', time '10:15', 'Mark Lim, Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 6, time '10:30', time '11:30', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 6, time '11:45', time '12:45', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 6, time '11:45', time '12:45', 'Alexander Lee'),
    ('ASK Headquarters Dojo', 'Adults', 6, time '13:00', time '14:00', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 6, time '14:15', time '15:15', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 6, time '14:15', time '15:15', 'Bob Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 6, time '15:30', time '16:30', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Mixed/Family', 6, time '15:30', time '16:30', 'Mun Kit'),
    ('ASK Headquarters Dojo', 'Mixed/Family', 6, time '16:45', time '17:45', 'Annie Goh'),
    ('ASK Headquarters Dojo', 'Adults', 6, time '18:00', time '19:00', 'Robin Tan'),
    ('Bukit Timah Dojo', 'Mixed/Family', 6, time '16:00', time '17:15', null),
    ('Cheng San Dojo', 'Children''s class', 6, time '10:00', time '11:00', null),
    ('Cheng San Dojo', 'Adults', 6, time '10:00', time '11:15', null),
    ('Japanese Association Dojo', 'Mixed/Family', 6, time '12:00', time '13:30', null),
    ('SAFRA Toa Payoh Dojo', 'Adults', 6, time '20:00', time '21:00', null),
    ('ActiveSG Yio Chu Kang Dojo', 'Mixed/Family', 6, time '16:00', time '17:00', null),
    ('ActiveSG Yio Chu Kang Dojo', 'Mixed/Family', 6, time '17:15', time '18:15', null),
    ('HomeTeamNS – Bukit Batok Dojo', 'Children''s class', 6, time '14:30', time '15:30', null),
    ('HomeTeamNS – Bukit Batok Dojo', 'Adults', 6, time '14:30', time '15:45', null),
    ('West Coast Dojo', 'Children''s class', 6, time '16:00', time '17:00', null),
    ('West Coast Dojo', 'Adults', 6, time '16:00', time '17:15', null),
    ('Chua Chu Kang Dojo', 'Mixed/Family', 6, time '16:30', time '17:30', null),
    ('HometeamNS Khatib', 'Mixed/Family', 6, time '11:00', time '12:00', null),
    ('Orchid Country Club Dojo', 'Children''s class', 6, time '15:00', time '16:00', null),
    ('Orchid Country Club Dojo', 'Adults', 6, time '15:00', time '16:15', null),
    ('Ci Yuan Dojo', 'Children''s class', 6, time '15:00', time '16:00', null),
    ('Ci Yuan Dojo', 'Adults', 6, time '15:00', time '16:15', null),
    ('ASK Headquarters Dojo', 'Children Beginners', 0, time '09:15', time '10:15', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'SG50', 0, time '09:15', time '10:15', 'Philip Lee'),
    ('ASK Headquarters Dojo', 'Children Beginners', 0, time '10:30', time '11:30', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 0, time '10:30', time '11:30', 'Ronald Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 0, time '11:45', time '12:45', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Adults', 0, time '11:45', time '12:45', 'Alexander Lee'),
    ('ASK Headquarters Dojo', 'Adults', 0, time '13:00', time '14:00', 'Mark Lim'),
    ('ASK Headquarters Dojo', 'Children Beginners', 0, time '14:15', time '15:15', 'Annie Goh'),
    ('ASK Headquarters Dojo', 'Adults', 0, time '14:15', time '15:15', 'Mark Lim'),
    ('ASK Headquarters Dojo', 'Children Beginners', 0, time '15:30', time '16:30', 'Nicholas Lee'),
    ('ASK Headquarters Dojo', 'Mixed/Family', 0, time '15:30', time '16:30', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Children Beginners', 0, time '16:45', time '17:45', 'Robin Tan'),
    ('ASK Headquarters Dojo', 'Ladies', 0, time '16:45', time '17:45', 'Robin Tan'),
    ('ActiveSG Bedok Dojo', 'Mixed/Family', 0, time '09:00', time '10:00', null),
    ('ActiveSG Bedok Dojo', 'Mixed/Family', 0, time '10:15', time '11:15', null),
    ('ActiveSG Bedok Dojo', 'Mixed/Family', 0, time '11:30', time '12:30', null),
    ('National Service Resort & Country Club', 'Mixed/Family', 0, time '15:00', time '16:15', null),
    ('ActiveSG Seng Kang Dojo', 'Mixed/Family', 0, time '13:30', time '14:30', null),
    ('ActiveSG Seng Kang Dojo', 'Mixed/Family', 0, time '14:45', time '15:45', null),
    ('The Singapore Island Country Club Dojo', 'Mixed/Family', 0, time '14:30', time '15:30', null),
    ('Civil Service Club (Bukit Batok) Dojo', 'Children''s class', 0, time '10:00', time '11:00', null),
    ('Civil Service Club (Bukit Batok) Dojo', 'Adults', 0, time '11:00', time '12:15', null),
    ('ActiveSG Jurong East', 'Mixed/Family', 0, time '14:45', time '15:45', null),
    ('Chong Pang Dojo', 'Mixed/Family', 0, time '11:00', time '12:00', null),
    ('ActiveSG Woodlands Dojo', 'Mixed/Family', 0, time '09:00', time '10:00', null),
    ('ActiveSG Woodlands Dojo', 'Mixed/Family', 0, time '10:15', time '11:15', null)
), dates as (
  select date '2026-11-09' + offset_day as session_date
  from generate_series(0, date '2027-02-28' - date '2026-11-09') as days(offset_day)
), instructors_by_name as (
  select lower(concat_ws(' ', first_name, last_name)) as name, min(id::text)::uuid as id
  from public.instructors
  group by 1
  having count(*) = 1
), occurrences as (
  select centre.id as centre_id, type.id as class_type_id, type.label as name,
    instructor.id as instructor_id,
    (dates.session_date + timetable.start_time) at time zone 'Asia/Singapore' as starts_at,
    (dates.session_date + timetable.end_time) at time zone 'Asia/Singapore' as ends_at,
    centre.capacity
  from timetable
  join dates on extract(dow from dates.session_date) = timetable.weekday
  join public.centres centre on centre.name = timetable.centre_name and centre.status = 'active'
  join public.class_types type on type.label = timetable.class_label
  left join instructors_by_name instructor on instructor.name = lower(timetable.instructor_name)
), candidates as materialized (
  select gen_random_uuid() as id, occurrence.*
  from occurrences occurrence
  where occurrence.starts_at > now()
    and not exists (
      select 1 from public.events event
      join public.classes class on class.event_id = event.id
      where event.centre_id = occurrence.centre_id and event.starts_at = occurrence.starts_at
        and class.class_type_id = occurrence.class_type_id
    )
), inserted as (
  insert into public.events (id, event_type, centre_id, instructor_id, name, starts_at, ends_at)
  select id, 'class', centre_id, instructor_id, name, starts_at, ends_at from candidates
  returning id
)
insert into public.classes (event_id, class_type_id, booking_capacity)
select inserted.id, candidates.class_type_id, case when candidates.capacity is null then 20 end
from inserted join candidates on candidates.id = inserted.id;

update public.classes class
set booking_capacity = 20
from public.events event
join public.centres centre on centre.id = event.centre_id
where class.event_id = event.id
  and class.booking_capacity is null and centre.capacity is null
  and event.status = 'scheduled'
  and event.starts_at > now()
  and event.starts_at < timestamptz '2027-03-01 00:00:00+08';
