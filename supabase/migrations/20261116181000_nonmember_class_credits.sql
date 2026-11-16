-- Apply after nonmember_student_status, in a separate transaction so the new
-- enum label can be used safely by these functions.
begin;

-- This is an explicit exception to the validity catalogue: non-member single
-- credits never expire. No other pass may have a null validity.
alter table credit_private.pass_validity alter column validity drop not null;
alter table credit_private.pass_validity drop constraint pass_validity_validity_check;
alter table credit_private.pass_validity add constraint pass_validity_validity_check
  check ((pass_id = 'nonmember-1' and validity is null)
    or (pass_id <> 'nonmember-1' and validity is not null and validity > interval '0'));
insert into credit_private.pass_validity(pass_id, credits, unlimited, validity)
values ('nonmember-1', 1, false, null)
on conflict (pass_id) do update set credits = 1, unlimited = false, validity = null;

-- If a non-member later applies for membership, keep their already-purchased
-- credits and switch the account's pass category to their submitted category.
create function membership_private.sync_applied_credit_type()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.form_data ->> 'membershipType' in ('adult','junior','student','senior') then
    update public.credit_accounts set membership_type = new.form_data ->> 'membershipType'
    where user_id = new.user_id;
  end if;
  return new;
end; $$;
revoke all on function membership_private.sync_applied_credit_type() from public, anon, authenticated;
create trigger sync_applied_credit_type after insert or update of form_data
on membership_private.application_details for each row
execute function membership_private.sync_applied_credit_type();

-- Keep the existing webhook's service-only, idempotent finalizer. Only the
-- verified webhook supplies a pass ID and amount; a return URL grants nothing.
create or replace function public.finalize_credit_checkout(
  auth_user uuid, stripe_session text, pass_id text, pass_title text,
  credits integer, unlimited boolean, membership_type text,
  paid_amount integer, paid_currency text, purchased_at timestamptz default now()
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  plan credit_private.pass_validity%rowtype;
  receipt public.credit_purchases%rowtype;
  paid_time timestamptz := purchased_at;
  expiry timestamptz;
begin
  if auth_user is null or stripe_session is null or btrim(stripe_session) = ''
    or paid_amount is null or paid_amount <= 0 or lower(paid_currency) is distinct from 'sgd'
    or paid_time is null or not isfinite(paid_time) or paid_time > now() + interval '5 minutes'
    or membership_type is null or membership_type not in ('adult','junior','student','senior','non_member') then
    raise exception 'Invalid credit purchase.';
  end if;
  if not exists(select 1 from public.users where id = auth_user and role = 'student') then
    raise exception 'Unknown student account.';
  end if;
  select * into plan from credit_private.pass_validity p where p.pass_id = finalize_credit_checkout.pass_id;
  if not found or plan.credits is distinct from credits or plan.unlimited is distinct from unlimited
    or (membership_type = 'non_member') is distinct from (pass_id = 'nonmember-1')
    or (pass_id = 'nonmember-1' and paid_amount <> 4000) then
    raise exception 'Unknown pass or credit amount mismatch.';
  end if;
  insert into public.credit_accounts(user_id,credits,unlimited,active,membership_type)
  values(auth_user,0,false,true,membership_type) on conflict(user_id) do nothing;
  perform user_id from public.credit_accounts where user_id = auth_user for update;
  select * into receipt from public.credit_purchases where stripe_session_id = stripe_session;
  if found then
    if receipt.user_id <> auth_user or receipt.pass_id <> pass_id
      or receipt.amount_cents <> paid_amount or receipt.currency <> lower(paid_currency) then
      raise exception 'Checkout identity mismatch.';
    end if;
    return;
  end if;
  expiry := case when plan.validity is null then 'infinity'::timestamptz
    else ((paid_time at time zone 'Asia/Singapore') + plan.validity) at time zone 'Asia/Singapore' end;
  insert into public.credit_purchases(stripe_session_id,user_id,pass_id,pass_title,credits,unlimited,amount_cents,currency,created_at)
  values(stripe_session,auth_user,pass_id,pass_title,credits,unlimited,paid_amount,lower(paid_currency),paid_time);
  insert into public.credit_batches(user_id,credits_total,credits_remaining,expires_at,created_at,unlimited,stripe_session_id)
  values(auth_user,case when unlimited then 0 else credits end,case when unlimited then 0 else credits end,
    expiry,paid_time,unlimited,stripe_session);
  perform credit_private.sync_account(auth_user);
  update public.credit_accounts set active = true where user_id = auth_user;
  insert into public.payments(student_id,item,description,amount_cents,currency,status,stripe_session_id,paid_at)
  select s.id,'Class pass',pass_title,paid_amount,lower(paid_currency),'paid',stripe_session,paid_time
  from public.students s where s.user_id = auth_user on conflict(stripe_session_id) do nothing;
end; $$;

-- The roster, capacity, overlap and booking lock rules are unchanged. Only
-- explicitly marked non-members may use the same booking core as members.
create or replace function student_calendar_private.change_booking_core(action text, target_id uuid, original_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  select * into member from public.students where user_id = (select auth.uid()) for update;
  if not found then raise exception 'Your account is not linked to a student record.'; end if;
  if action is null or action not in ('enrol', 'cancel', 'reschedule', 'join', 'leave')
    or target_id is null or (action = 'reschedule' and (original_id is null or original_id = target_id)) then
    raise exception 'Choose a valid class and booking action.';
  end if;
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
    delete from public.event_students where event_id = target_id and student_id = member.id
      and attendance_status is null and checked_in_at is null;
    if not found then raise exception 'No cancellable booking was found.'; end if;
    return student_calendar_private.schedule();
  end if;
  if member.membership_status not in ('active','non_member') then
    raise exception 'An active membership or non-member class credit is required to book classes.';
  end if;
  if action = 'reschedule' then
    select e.* into original from public.events e join public.classes c on c.event_id = e.id where e.id = original_id;
    if not found or original.starts_at <= now() or original.status <> 'scheduled' then
      raise exception 'The original class can no longer be rescheduled.';
    end if;
    delete from public.event_students where event_id = original_id and student_id = member.id
      and attendance_status is null and checked_in_at is null;
    if not found then raise exception 'No reschedulable booking was found.'; end if;
  end if;
  if exists(select 1 from public.event_students where event_id = target_id and student_id = member.id) then
    raise exception 'You are already enrolled in this class.';
  end if;
  select coalesce(c.booking_capacity, ce.capacity) into seat_limit
    from public.classes c join public.centres ce on ce.id = target.centre_id where c.event_id = target_id;
  if seat_limit is null then raise exception 'Online booking is unavailable because class capacity has not been configured.'; end if;
  select count(*) into occupied from public.event_students where event_id = target_id;
  if action = 'join' then
    if occupied < seat_limit then raise exception 'A spot is available. Enrol in this class instead.'; end if;
    insert into public.class_waitlist(event_id, student_id) values (target_id, member.id) on conflict do nothing;
  else
    if occupied >= seat_limit then raise exception 'This class is full. Join the waitlist from the timetable.'; end if;
    if exists(select 1 from public.event_students es join public.events e on e.id = es.event_id
      where es.student_id = member.id and e.status = 'scheduled'
        and e.starts_at < target.ends_at and target.starts_at < e.ends_at) then
      raise exception 'You already have a booking at that time.';
    end if;
    if action = 'enrol' then
      select * into account from public.credit_accounts where user_id = member.user_id for update;
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
end; $$;

-- Existing credit wrapper remains the only seat + batch entry point. The
-- selected class chooses the first home dojo; no arbitrary dojo is accepted.
create function public.enrol_nonmember_class(target_id uuid, birth_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  profile public.users%rowtype;
  event_row public.events%rowtype;
  member_id uuid := gen_random_uuid();
  result jsonb;
begin
  if caller is null or (select public.current_user_role()) is distinct from 'student'::public.user_role then
    raise exception 'Sign in as a student to book a class.';
  end if;
  select * into profile from public.users where id = caller and role = 'student' for update;
  if not found then raise exception 'Student profile not found.'; end if;
  if exists (select 1 from public.students where user_id = caller)
    or exists (select 1 from membership_private.application_details where user_id = caller) then
    raise exception 'Use your existing student booking account.';
  end if;
  if birth_date is null or birth_date > current_date
    or birth_date < (current_date - interval '120 years')::date then
    raise exception 'Enter a valid date of birth.';
  end if;
  if nullif(btrim(profile.first_name), '') is null or nullif(btrim(profile.last_name), '') is null then
    raise exception 'Complete your first and last name before booking.';
  end if;
  if exists (select 1 from public.students where lower(email) = lower(profile.email)) then
    raise exception 'Your email is linked to another student record; contact your dojo.';
  end if;
  select e.* into event_row from public.events e join public.classes c on c.event_id = e.id
  where e.id = target_id and e.status = 'scheduled' and e.starts_at > now();
  if not found then raise exception 'Choose an upcoming class.'; end if;
  insert into public.students(id,user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,membership_status,joined_at)
  values(member_id,caller,member_id::text,profile.first_name,profile.last_name,profile.email,
    event_row.centre_id,birth_date,'non_member',current_date);
  -- Purchases made before the first class did not yet have a student ID for
  -- their payments history; fill that history once the booking creates it.
  insert into public.payments(student_id,item,description,amount_cents,currency,status,stripe_session_id,paid_at)
  select member_id,'Class pass',p.pass_title,p.amount_cents,p.currency,'paid',p.stripe_session_id,p.created_at
  from public.credit_purchases p where p.user_id = caller
  on conflict(stripe_session_id) do nothing;
  result := student_calendar_private.change_booking('enrol',target_id,null);
  return result;
end; $$;
revoke all on function public.enrol_nonmember_class(uuid,date) from public, anon, authenticated;
grant execute on function public.enrol_nonmember_class(uuid,date) to authenticated;

-- Reuse the schedule shape for members, and explicitly flag first bookings.
create or replace function student_calendar_private.schedule()
returns jsonb language sql stable security definer set search_path = '' as $$
  with viewer as (
    select s.id, s.membership_status, g.label as grade
    from public.students s left join public.grades g on g.id = s.current_grade_id
    where s.user_id = (select auth.uid()) and (select public.current_user_role()) = 'student'
  ), sessions as (
    select e.id, e.name, e.starts_at, e.ends_at, e.status,
      c.class_type_id, t.label as class_type, t.description,
      ce.name as centre, coalesce(c.booking_capacity, ce.capacity) as capacity,
      nullif(concat_ws(' ', i.first_name, i.last_name), '') as instructor,
      (select count(*) from public.event_students roster where roster.event_id = e.id) as occupied,
      es.student_id is not null as booked, es.attendance_status,
      es.moved_from_event_id, w.student_id is not null as waitlisted
    from public.events e join public.classes c on c.event_id = e.id
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
    'needs_profile', not exists(select 1 from viewer),
    'active', coalesce((select membership_status in ('active','non_member') from viewer),
      (select public.current_user_role()) = 'student'),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at, s.id) from sessions s), '[]'::jsonb)
  );
$$;

notify pgrst, 'reload schema';
commit;
