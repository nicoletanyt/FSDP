-- Provision domain instructors in the same transaction as the trusted account
-- profile. Existing unlinked accounts are handled only on their first save.
begin;

create function public.create_linked_instructor_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'instructor'::public.user_role then
    insert into public.instructors(user_id, first_name, last_name, email)
    values (new.id, new.first_name, new.last_name, new.email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.create_linked_instructor_record() from public, anon, authenticated;
create trigger users_create_linked_instructor
after insert or update of role on public.users
for each row execute function public.create_linked_instructor_record();

-- Protect direct instructor REST writes as well as the RPC below. The owner row
-- lock serializes availability writes for the same instructor across sessions.
create function public.validate_instructor_availability()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.current_user_role() is distinct from 'instructor'::public.user_role then return new; end if;
  if new.instructor_id is distinct from public.current_instructor_id() then
    raise exception 'Availability must belong to the current instructor' using errcode = '42501';
  end if;
  perform 1 from public.instructors where id = new.instructor_id for update;
  if new.date is null or new.start_time is null or new.end_time is null
     or new.start_time < time '08:00' or new.end_time > time '22:00'
     or new.end_time <= new.start_time
     or ((new.date + new.start_time) at time zone 'Asia/Singapore') <= now() then
    raise exception 'Choose a future availability between 08:00 and 22:00 Singapore time' using errcode = 'PAV03';
  end if;
  if exists (
    select 1 from public.instructor_availability a
    where a.instructor_id = new.instructor_id and a.date = new.date
      and a.id <> new.id and a.start_time < new.end_time and a.end_time > new.start_time
  ) then
    raise exception 'Availability overlaps an existing slot' using errcode = 'PAV01';
  end if;
  if exists (
    select 1 from public.events e where e.instructor_id = new.instructor_id and e.status <> 'cancelled'
      and e.starts_at < ((new.date + new.end_time) at time zone 'Asia/Singapore')
      and e.ends_at > ((new.date + new.start_time) at time zone 'Asia/Singapore')
  ) then
    raise exception 'Availability overlaps a scheduled event' using errcode = 'PAV02';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_instructor_availability() from public, anon, authenticated;
create trigger instructor_availability_validate
before insert or update on public.instructor_availability
for each row execute function public.validate_instructor_availability();

create function public.create_instructor_availability(expected_user uuid, slot_date date, slot_start time, slot_end time)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  profile public.users%rowtype;
  owner_id uuid;
  saved public.instructor_availability%rowtype;
begin
  -- Ownership always comes from auth.uid(). expected_user fences a stale form
  -- against an account switch between the client auth check and this request.
  if (select auth.uid()) is null or expected_user is distinct from (select auth.uid()) then
    raise exception 'The signed-in account changed' using errcode = '42501';
  end if;
  select * into profile from public.users where id = (select auth.uid()) and role = 'instructor' for update;
  if not found then raise exception 'Instructor access is required' using errcode = '42501'; end if;

  select id into owner_id from public.instructors where user_id = profile.id;
  if owner_id is null then
    begin
      insert into public.instructors(user_id, first_name, last_name, email)
      values (profile.id, profile.first_name, profile.last_name, profile.email)
      returning id into owner_id;
    exception when unique_violation then
      -- Never claim a legacy instructor by an email/name match.
      raise exception 'Unable to create the linked instructor record' using errcode = 'PAV04';
    end;
  end if;
  perform 1 from public.instructors where id = owner_id for update;

  -- Returning an exact existing slot makes a retry after a lost response safe.
  select * into saved from public.instructor_availability
    where instructor_id = owner_id and date = slot_date and start_time = slot_start and end_time = slot_end;
  if found then return to_jsonb(saved); end if;

  insert into public.instructor_availability(instructor_id, date, start_time, end_time)
  values (owner_id, slot_date, slot_start, slot_end) returning * into saved;
  -- Trigger failures roll back both the slot and first-save instructor creation.
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_instructor_availability(uuid,date,time,time) from public, anon;
grant execute on function public.create_instructor_availability(uuid,date,time,time) to authenticated;

commit;
