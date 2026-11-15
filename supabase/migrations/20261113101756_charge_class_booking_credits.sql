CREATE OR REPLACE FUNCTION student_calendar_private.change_booking(action text, target_id uuid, original_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  member public.students%rowtype;
  target public.events%rowtype;
  original public.events%rowtype;
  seat_limit integer;
  occupied integer;
  account record;
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

    if action = 'enrol' then
      select * into account from public.credit_accounts
        where user_id = member.user_id for update;
      if not found or not account.active or (not account.unlimited and account.credits < 1) then
        raise exception 'Insufficient credits. Top up your class pass before enrolling.';
      end if;
      if not account.unlimited then
        update public.credit_accounts set credits = credits - 1 where user_id = member.user_id;
      end if;
    end if;

    insert into public.event_students(event_id, student_id, moved_from_event_id)
    values (target_id, member.id, case when action = 'reschedule' then original_id end);
    delete from public.class_waitlist where event_id = target_id and student_id = member.id;
  end if;

  return student_calendar_private.schedule();
end;
$function$;
