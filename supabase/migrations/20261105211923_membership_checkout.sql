-- Membership sign-up: a student submits the application (pending row), pays
-- through Stripe Checkout, and the verified webhook activates the membership.
-- Both functions are service_role only; browsers can never activate themselves.

create function public.submit_membership_application(auth_user uuid, application jsonb)
returns table(student_id uuid, membership_status public.membership_status)
language plpgsql security definer set search_path = '' as $$
declare
  profile public.users%rowtype;
  existing public.students%rowtype;
  new_id uuid := gen_random_uuid();
  first_name_ text := left(trim(coalesce(application ->> 'first_name', '')), 100);
  last_name_ text := left(trim(coalesce(application ->> 'last_name', '')), 100);
  phone_ text := nullif(left(trim(coalesce(application ->> 'phone', '')), 30), '');
  dob date;
  centre uuid;
  contact_name text := left(trim(coalesce(application #>> '{emergency_contact,name}', '')), 100);
  contact_relationship text := left(trim(coalesce(application #>> '{emergency_contact,relationship}', '')), 50);
  contact_phone text := left(trim(coalesce(application #>> '{emergency_contact,phone}', '')), 30);
  medical text := nullif(left(trim(coalesce(application ->> 'medical_details', '')), 1000), '');
begin
  select * into profile from public.users where id = auth_user and role = 'student';
  if not found then raise exception 'Only student accounts can apply for membership'; end if;

  begin
    dob := (application ->> 'date_of_birth')::date;
    centre := (application ->> 'home_centre_id')::uuid;
  exception when others then
    raise exception 'Invalid date of birth or centre';
  end;

  if first_name_ = '' or last_name_ = '' then raise exception 'Full name is required'; end if;
  if dob is null or dob > current_date or dob < current_date - interval '120 years' then
    raise exception 'Invalid date of birth';
  end if;
  if not exists (select 1 from public.centres c where c.id = centre and c.status = 'active') then
    raise exception 'Select an active centre';
  end if;
  if contact_name = '' or contact_relationship = '' or contact_phone = '' then
    raise exception 'Emergency contact is required';
  end if;

  select * into existing from public.students s where s.user_id = auth_user for update;

  if found and existing.membership_status = 'active' then
    return query select existing.id, existing.membership_status;
    return;
  end if;

  -- Never attach this account to another person's imported student record.
  if exists (
    select 1 from public.students s
    where lower(s.email) = lower(profile.email) and s.user_id is distinct from auth_user
  ) then
    raise exception 'This email already belongs to a student record; contact the dojo';
  end if;

  if found then
    update public.students s set
      first_name = first_name_, last_name = last_name_, phone = phone_,
      date_of_birth = dob, home_centre_id = centre, email = profile.email,
      membership_status = 'pending', updated_at = now()
    where s.id = existing.id;
    new_id := existing.id;
  else
    -- Member numbers are the student's UUID (no prefix).
    insert into public.students (
      id, user_id, member_no, first_name, last_name, email, phone,
      home_centre_id, date_of_birth, membership_status, joined_at
    ) values (
      new_id, auth_user, new_id::text, first_name_, last_name_, profile.email, phone_,
      centre, dob, 'pending', current_date
    );
  end if;

  delete from public.emergency_contacts e where e.student_id = new_id and e.is_primary;
  insert into public.emergency_contacts (student_id, name, relationship, phone, is_primary)
  values (new_id, contact_name, contact_relationship, contact_phone, true);

  if medical is not null and not exists (
    select 1 from public.student_medical_alerts m
    where m.student_id = new_id and m.active and m.description = medical
  ) then
    insert into public.student_medical_alerts (student_id, description) values (new_id, medical);
  end if;

  return query select new_id, 'pending'::public.membership_status;
end; $$;

revoke all on function public.submit_membership_application(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_membership_application(uuid, jsonb) to service_role;

-- Called only by the Stripe webhook after it re-verifies the paid session.
-- Idempotent: repeated deliveries leave an active membership unchanged.
create function public.finalize_membership_checkout(student uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.students s
    set membership_status = 'active', updated_at = now()
    where s.id = student and s.user_id is not null;
  if not found then raise exception 'Unknown membership applicant'; end if;
end; $$;

revoke all on function public.finalize_membership_checkout(uuid) from public, anon, authenticated;
grant execute on function public.finalize_membership_checkout(uuid) to service_role;
