-- Official 2026 grading dates are date-only until the reporting time is set.
-- Other event types continue to require actual start/end timestamps.
alter table public.events alter column starts_at drop not null;
alter table public.events alter column ends_at drop not null;
alter table public.events add constraint events_non_grading_times_required
  check (event_type = 'grading' or (starts_at is not null and ends_at is not null));
alter table public.events add constraint events_times_both_or_neither
  check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at is not null));

alter table public.gradings
  add column grading_date date,
  add column application_opens_on date,
  add column reporting_release_on date,
  add column reporting_time time without time zone,
  add column official_schedule boolean not null default false;
alter table public.gradings add constraint gradings_official_schedule_dates
  check (not official_schedule or
    (grading_date is not null and application_opens_on is not null and
     application_deadline is not null and reporting_release_on is not null and
     application_opens_on <= application_deadline and
     application_deadline < grading_date and
     reporting_release_on <= grading_date));

-- Keep the send history even when the demo future events it referenced are removed.
alter table public.grading_email_sends add column event_name text;
update public.grading_email_sends n set event_name = e.name
  from public.events e where e.id = n.grading_event_id;
alter table public.grading_email_sends alter column grading_event_id drop not null;
alter table public.grading_email_sends drop constraint grading_email_sends_grading_event_id_fkey;
alter table public.grading_email_sends add constraint grading_email_sends_grading_event_id_fkey
  foreign key (grading_event_id) references public.gradings(event_id) on delete set null;

-- The user approved replacing the three conflicting, future demo events and
-- their seven mock applications. Keep completed events and their assessments.
do $$ begin
  if exists (select 1 from public.grading_checkout_attempts where grading_event_id in (
    'd29105f9-ef6c-4e87-8419-a6b5a69ca1af',
    '699dbd22-d137-4be4-81bd-10b6a2ab710c',
    '706fd48c-6e71-483e-938d-cb0001b413e6')) then
    raise exception 'Cannot replace a grading event with a checkout attempt';
  end if;
end $$;
delete from public.events where id in (
  'd29105f9-ef6c-4e87-8419-a6b5a69ca1af',
  '699dbd22-d137-4be4-81bd-10b6a2ab710c',
  '706fd48c-6e71-483e-938d-cb0001b413e6'
);

do $$
declare
  venue uuid;
  new_event uuid;
  entry record;
  today_sg date := (now() at time zone 'Asia/Singapore')::date;
begin
  select id into strict venue from public.centres
    where name = 'ASK Headquarters Dojo'
      and address = 'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630';
  for entry in
    select * from (values
      ('adult'::public.grade_track, '2026-03-08'::date, '2026-01-25'::date, '2026-02-22'::date, '2026-03-01'::date),
      ('adult'::public.grade_track, '2026-06-21'::date, '2026-05-10'::date, '2026-06-07'::date, '2026-06-14'::date),
      ('adult'::public.grade_track, '2026-09-13'::date, '2026-08-02'::date, '2026-08-30'::date, '2026-09-06'::date),
      ('adult'::public.grade_track, '2026-12-13'::date, '2026-11-01'::date, '2026-11-29'::date, '2026-12-06'::date),
      ('children'::public.grade_track, '2026-04-12'::date, '2026-03-01'::date, '2026-03-29'::date, '2026-04-05'::date),
      ('children'::public.grade_track, '2026-08-16'::date, '2026-07-04'::date, '2026-08-02'::date, '2026-08-09'::date),
      ('children'::public.grade_track, '2026-12-06'::date, '2026-10-25'::date, '2026-11-22'::date, '2026-11-29'::date)
    ) as schedule(track, grading_date, opens_on, closes_on, release_on)
  loop
    insert into public.events(event_type, centre_id, name, starts_at, ends_at, status)
    values ('grading', venue,
      case when entry.track = 'adult' then 'Adult grading' else 'Children''s grading' end ||
        ' — ' || to_char(entry.grading_date, 'DD Mon YYYY'),
      null, null,
      case when entry.grading_date < today_sg then 'completed'::public.event_status else 'scheduled'::public.event_status end)
    returning id into new_event;
    insert into public.gradings(event_id, track, grading_date, application_opens_on,
      application_deadline, reporting_release_on, application_status, official_schedule)
    values (new_event, entry.track, entry.grading_date, entry.opens_on,
      entry.closes_on, entry.release_on,
      case when entry.grading_date < today_sg then 'closed'::public.grading_window_status else 'open'::public.grading_window_status end,
      true);
    -- A student may apply only for their next grade on the matching track.
    insert into public.grading_target_grades(grading_event_id, grade_id)
      select new_event, gt.grade_id from public.grade_tracks gt where gt.track = entry.track;
  end loop;
end $$;

create or replace function public.eligible_grading_students(target_event uuid)
returns table(student_id uuid, user_id uuid, email text, target_grade_id text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.email, next_grade.id
  from public.gradings gr
  join public.events e on e.id = gr.event_id
  join public.students s on s.membership_status = 'active' and not s.outstanding_fees
    and (s.home_centre_id = e.centre_id or gr.official_schedule)
    and s.user_id is not null
  join public.grades current_grade on current_grade.id = s.current_grade_id
  join lateral (
    select grade.id from public.grades grade
    join public.grade_tracks gt on gt.grade_id = grade.id and gt.track = gr.track
    where grade.sort_order > current_grade.sort_order
    order by grade.sort_order limit 1
  ) next_grade on true
  join public.grading_target_grades tgt on tgt.grading_event_id = e.id and tgt.grade_id = next_grade.id
  join public.grade_requirements req on req.grade_id = next_grade.id and req.track = gr.track
  where gr.event_id = target_event and gr.application_status = 'open'
    and (case when extract(year from now() at time zone 'Asia/Singapore') - extract(year from s.date_of_birth) >= 13
      then gr.track = 'adult' else gr.track = 'children' end)
    and e.status = 'scheduled'
    and (gr.grading_date is null and e.starts_at > now() or gr.grading_date > (now() at time zone 'Asia/Singapore')::date)
    and (gr.application_opens_on is null or gr.application_opens_on <= (now() at time zone 'Asia/Singapore')::date)
    and gr.application_deadline >= (now() at time zone 'Asia/Singapore')::date
    and s.joined_at <= (now() at time zone 'Asia/Singapore')::date - interval '3 months'
    and (req.min_age_years is null or extract(year from now() at time zone 'Asia/Singapore') - extract(year from s.date_of_birth) >= req.min_age_years)
    and (req.min_months = 0 or s.last_graded_at <= (now() at time zone 'Asia/Singapore')::date - make_interval(months => req.min_months))
    and (req.min_sessions is null or (select count(*) from public.event_students es
      join public.events ce on ce.id = es.event_id
      where es.student_id = s.id and ce.event_type = 'class'
        and ce.starts_at::date >= coalesce(s.last_graded_at, s.joined_at)
        and es.attendance_status in ('present', 'late')) >= req.min_sessions)
    and not exists (select 1 from public.syllabus_items si
      where si.grade_id = next_grade.id and si.track = gr.track
      and not exists (select 1 from public.technique_sign_offs tso
        where tso.student_id = s.id and tso.syllabus_item_id = si.id))
    and not exists (select 1 from public.grading_applications a where a.student_id = s.id and a.grading_event_id = e.id);
$$;

drop function public.my_grading_opportunities();
create function public.my_grading_opportunities()
returns table(id uuid, name text, grading_date date, application_deadline date,
  reporting_release_on date, reporting_time time without time zone,
  centre_name text, venue_address text, target_grade text, applied boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date),
    g.application_deadline, g.reporting_release_on,
    case when g.reporting_release_on <= (now() at time zone 'Asia/Singapore')::date then g.reporting_time else null end,
    c.name, c.address,
    coalesce(eligible.target_grade_id, a.target_grade_id), a.id is not null
  from public.students s
  join public.events e on e.event_type = 'grading'
  join public.gradings g on g.event_id = e.id and (g.official_schedule or e.centre_id = s.home_centre_id)
  join public.centres c on c.id = e.centre_id
  left join lateral (select eg.target_grade_id from public.eligible_grading_students(e.id) eg where eg.student_id = s.id) eligible on true
  left join public.grading_applications a on a.student_id = s.id and a.grading_event_id = e.id
  where s.user_id = (select auth.uid()) and (eligible.target_grade_id is not null or a.id is not null)
    and (g.grading_date is null and e.starts_at > now() or g.grading_date >= (now() at time zone 'Asia/Singapore')::date)
  order by coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date);
$$;
revoke all on function public.my_grading_opportunities() from public, anon;
grant execute on function public.my_grading_opportunities() to authenticated;

-- Date-only events require the client to read these metadata fields instead of
-- treating a null starts_at as midnight or an actual grading time.