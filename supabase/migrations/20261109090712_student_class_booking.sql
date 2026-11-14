create schema if not exists student_calendar_private;
grant usage on schema student_calendar_private to authenticated;

create table public.class_waitlist (
  event_id uuid not null references public.classes(event_id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, student_id)
);

create index class_waitlist_student_idx on public.class_waitlist(student_id);
alter table public.class_waitlist enable row level security;
revoke all on public.class_waitlist from public, anon, authenticated;
grant select on public.class_waitlist to authenticated;
create policy "Students read their own class waitlist" on public.class_waitlist
for select to authenticated
using (student_id = (select public.current_student_id()));

alter table public.event_students
  add column moved_from_event_id uuid;

alter table public.classes
  add column booking_capacity smallint check (booking_capacity > 0);

create function student_calendar_private.schedule()
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
        or (e.status = 'scheduled' and e.starts_at > now() and e.starts_at <= now() + interval '90 days'))
  )
  select jsonb_build_object(
    'grade', (select grade from viewer),
    'linked', exists(select 1 from viewer),
    'active', coalesce((select membership_status = 'active' from viewer), false),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at, s.id) from sessions s), '[]'::jsonb)
  );
$$;

create function student_calendar_private.change_booking(
  action text, target_id uuid, original_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  member public.students%rowtype;
  target public.events%rowtype;
  original public.events%rowtype;
  seat_limit integer;
  occupied integer;
begin
  if (select auth.uid()) is null or (select public.current_user_role()) is distinct from 'student'::public.user_role then
    raise exception 'Sign in as a student to manage class bookings.';
  end if;

  -- The member lock serializes overlapping booking requests from the same student.
  select * into member from public.students where user_id = (select auth.uid()) for update;
  if not found then raise exception 'Your account is not linked to a student membership.'; end if;

  if action is null or action not in ('enrol', 'cancel', 'reschedule', 'join', 'leave')
    or target_id is null or (action = 'reschedule' and (original_id is null or original_id = target_id)) then
    raise exception 'Choose a valid class and booking action.';
  end if;

  -- Take event locks in a consistent order for two-session moves.
  perform id from public.events
    where id = target_id or (action = 'reschedule' and id = original_id)
    order by id for update;

  select e.* into target from public.events e join public.classes c on c.event_id = e.id where e.id = target_id;
  if not found then raise exception 'Class session not found.'; end if;

  if action = 'leave' then
    delete from public.class_waitlist where event_id = target_id and student_id = member.id;
    return student_calendar_private.schedule();
  end if;

  if target.starts_at <= now() or (target.status <> 'scheduled' and action <> 'cancel') then
    raise exception 'This class is no longer available for that action.';
  end if;

  if action = 'cancel' then
    delete from public.event_students
      where event_id = target_id and student_id = member.id
        and attendance_status is null and checked_in_at is null;
    if not found then raise exception 'No cancellable booking was found.'; end if;
    return student_calendar_private.schedule();
  end if;

  if member.membership_status <> 'active' then raise exception 'An active membership is required to book classes.'; end if;

  if action = 'reschedule' then
    select e.* into original from public.events e join public.classes c on c.event_id = e.id where e.id = original_id;
    if not found or original.starts_at <= now() or original.status <> 'scheduled' then
      raise exception 'The original class can no longer be rescheduled.';
    end if;
    delete from public.event_students
      where event_id = original_id and student_id = member.id
        and attendance_status is null and checked_in_at is null;
    if not found then raise exception 'No reschedulable booking was found.'; end if;
  end if;

  if exists(select 1 from public.event_students where event_id = target_id and student_id = member.id) then
    raise exception 'You are already enrolled in this class.';
  end if;
  select coalesce(c.booking_capacity, ce.capacity) into seat_limit
    from public.classes c join public.centres ce on ce.id = target.centre_id
    where c.event_id = target_id;
  if seat_limit is null then raise exception 'Online booking is unavailable because class capacity has not been configured.'; end if;
  select count(*) into occupied from public.event_students where event_id = target_id;

  if action = 'join' then
    if occupied < seat_limit then raise exception 'A spot is available. Enrol in this class instead.'; end if;
    insert into public.class_waitlist(event_id, student_id) values (target_id, member.id) on conflict do nothing;
  else
    if occupied >= seat_limit then raise exception 'This class is full. Join the waitlist from the timetable.'; end if;
    if exists(
      select 1 from public.event_students es join public.events e on e.id = es.event_id
      where es.student_id = member.id and e.status = 'scheduled'
        and e.starts_at < target.ends_at and target.starts_at < e.ends_at
    ) then raise exception 'You already have a booking at that time.'; end if;

    insert into public.event_students(event_id, student_id, moved_from_event_id)
    values (target_id, member.id, case when action = 'reschedule' then original_id end);
    delete from public.class_waitlist where event_id = target_id and student_id = member.id;
  end if;

  return student_calendar_private.schedule();
end;
$$;

create function public.student_class_schedule()
returns jsonb language sql security invoker set search_path = ''
as $$ select student_calendar_private.schedule(); $$;

create function public.change_student_class_booking(action text, target_id uuid, original_id uuid default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select student_calendar_private.change_booking(action, target_id, original_id); $$;

revoke all on function student_calendar_private.schedule(), student_calendar_private.change_booking(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.student_class_schedule(), public.change_student_class_booking(text, uuid, uuid) from public, anon, authenticated;
grant execute on function student_calendar_private.schedule(), student_calendar_private.change_booking(text, uuid, uuid) to authenticated;
grant execute on function public.student_class_schedule(), public.change_student_class_booking(text, uuid, uuid) to authenticated;
