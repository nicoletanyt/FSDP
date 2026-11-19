-- One-time demo data: enroll only the 150 synthetic.*@example.test students
-- who have no finished/marked bookings. Preserve existing unmarked future
-- bookings; never overwrite another student's attendance or backdate a join.
begin;

do $$
declare
  cohort_size integer;
  inserted integer;
begin
  select count(*) into cohort_size from public.students
  where email like 'synthetic.%@example.test';
  if cohort_size <> 150 then
    raise exception 'Expected 150 synthetic students, found %', cohort_size;
  end if;
  if exists (
    select 1 from public.event_students es join public.students s on s.id = es.student_id
    join public.events e on e.id = es.event_id
    where s.email like 'synthetic.%@example.test'
      and (e.ends_at <= now() or e.status <> 'scheduled' or es.attendance_status is not null
        or es.recorded_at is not null or es.checked_in_at is not null)
  ) then
    raise exception 'Synthetic students already have finished or marked enrolments; refusing to alter their history';
  end if;

  with cohort as (
    select s.id as student_id, s.home_centre_id, s.date_of_birth, s.joined_at,
      (row_number() over (order by s.id) - 1)::integer as cohort_index
    from public.students s where s.email like 'synthetic.%@example.test'
  ), candidates as (
    select s.student_id, s.cohort_index, cl.event_id, cl.starts_at, cl.ends_at,
      row_number() over (partition by s.student_id order by cl.starts_at desc, cl.event_id desc) as rn
    from cohort s
    join lateral (
      -- One class per day; reserve room for up to five synthetic students at
      -- the same dojo (the cohort has at most five per home centre).
      select distinct on ((e.starts_at at time zone 'Asia/Singapore')::date)
        e.id as event_id, e.starts_at, e.ends_at
      from public.events e
      join public.classes c on c.event_id = e.id
      join public.centres centre on centre.id = e.centre_id
      where e.event_type = 'class' and e.status = 'completed' and e.ends_at <= now()
        and e.centre_id = s.home_centre_id
        and (e.starts_at at time zone 'Asia/Singapore')::date >= s.joined_at
        and (c.class_type_id in ('regular', 'mixed-family')
          or (extract(year from e.starts_at at time zone 'Asia/Singapore')
              - extract(year from s.date_of_birth) < 13
            and (c.class_type_id like 'children-%' or c.class_type_id = 'kids'))
          or (extract(year from e.starts_at at time zone 'Asia/Singapore')
              - extract(year from s.date_of_birth) >= 13
            and c.class_type_id in ('adults', 'weapons')))
        and (select count(*) from public.event_students es where es.event_id = e.id)
          <= coalesce(c.booking_capacity, centre.capacity, 20) - 5
      order by (e.starts_at at time zone 'Asia/Singapore')::date desc,
        e.starts_at desc, e.id desc
      limit 5
    ) cl on true
  ), planned as (
    select c.*,
      case
        when c.cohort_index % 10 = 1 then 'present'
        when c.cohort_index % 10 = 2 then case when c.rn = 1 then 'absent' else 'present' end
        when c.cohort_index % 10 = 3 then case when c.rn <= 2 then 'absent' else 'late' end
        when c.cohort_index % 10 in (4, 5) then case when c.rn <= 3 then 'absent' else 'present' end
        when c.cohort_index % 10 = 6 then case when c.rn <= 4 then 'absent' else 'late' end
        when c.cohort_index % 10 = 7 then case c.rn when 1 then 'absent' when 2 then 'excused'
          when 5 then 'absent' else 'present' end
        when c.cohort_index % 10 = 8 then case when c.rn <= 3 then 'absent'
          when c.rn = 4 then null else 'present' end
        else case when c.rn = 1 then 'late' else 'present' end
      end as attendance
    from candidates c
    where c.rn <= case c.cohort_index % 10
      when 0 then 0 when 1 then 1 when 2 then 2 when 3 then 3 when 4 then 4 else 5 end
  )
  insert into public.event_students(event_id, student_id, attendance_status, recorded_at, checked_in_at)
  select p.event_id, p.student_id, p.attendance::public.attendance_status,
    case when p.attendance in ('present', 'late') then p.starts_at
      + case when p.attendance = 'late' then interval '8 minutes' else interval '2 minutes' end
      when p.attendance is not null then p.ends_at end,
    case when p.attendance in ('present', 'late') then p.starts_at
      + case when p.attendance = 'late' then interval '8 minutes' else interval '2 minutes' end end
  from planned p;

  get diagnostics inserted = row_count;
  if inserted < 300 or inserted > 700 then
    raise exception 'Unexpected synthetic enrolment count: %', inserted;
  end if;
end;
$$;

commit;
