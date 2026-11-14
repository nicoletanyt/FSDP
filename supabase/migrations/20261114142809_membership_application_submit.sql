-- Requires the existing domain schema and credit checkout migrations.
-- Do not replay the destructive 20261102041227 reset on a populated database.
do $$
begin
  if to_regclass('public.students') is null or to_regclass('public.credit_accounts') is null then
    raise exception 'Missing base schema: apply the existing students and credit checkout migrations first. Do not replay the reset migration on a populated database.';
  end if;
end; $$;
create schema if not exists membership_private;
revoke all on schema membership_private from public, anon, authenticated;
grant usage on schema membership_private to authenticated;

-- Full form snapshot, including identity, guardian and medical fields. This is
-- deliberately NOT in public: instructor student reads must not expose NRICs.
create table if not exists membership_private.application_details (
  student_id uuid primary key references public.students(id) on delete cascade,
  user_id uuid not null unique references public.users(id) on delete cascade,
  form_data jsonb not null check (jsonb_typeof(form_data) = 'object'),
  submitted_at timestamptz not null default now()
);
alter table membership_private.application_details enable row level security;
revoke all on membership_private.application_details from public, anon, authenticated;

create or replace function membership_private.submit_application(application jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  account public.users%rowtype;
  member public.students%rowtype;
  full_name text := btrim(application ->> 'fullName');
  birth_date date;
  centre uuid;
  field text;
  application_type text := application ->> 'membershipType';
begin
  if caller is null then raise exception 'Please sign in again.'; end if;
  -- Serializes retries for the same account, including first-time applications.
  select * into account from public.users where id = caller for update;
  if not found or account.role <> 'student' then
    raise exception 'Only student accounts can apply for membership.';
  end if;
  if application is null or jsonb_typeof(application) <> 'object'
     or octet_length(application::text) > 30000 then
    raise exception 'Invalid application.';
  end if;
  foreach field in array array['fullName','nric','nationality','dob','gender','mobile',
    'address','photoName','principalDojo','membershipType','currentBelt',
    'emergencyName','emergencyRelationship','emergencyPhone'] loop
    if nullif(btrim(application ->> field), '') is null
       or char_length(application ->> field) > 1000 then
      raise exception 'Missing or invalid field: %', field;
    end if;
  end loop;
  if char_length(full_name) > 100 then raise exception 'Name is too long.'; end if;
  if (application ->> 'nric') !~ '^[STFGM][0-9]{7}[A-Z]$'
     or (application ->> 'mobile') !~ '^[0-9]{8}$'
     or (application ->> 'emergencyPhone') !~ '^[0-9]{8}$' then
    raise exception 'Invalid NRIC or phone number.';
  end if;
  if application_type not in ('adult','junior','student','senior') then
    raise exception 'Invalid membership type.';
  end if;
  if application -> 'waiverSigned' is distinct from 'true'::jsonb
     or application -> 'isDeclared' is distinct from 'true'::jsonb then
    raise exception 'Please accept the waiver and declaration.';
  end if;
  foreach field in array array['heart','dizziness','joint'] loop
    if jsonb_typeof(application #> array['parqAnswers', field]) is distinct from 'boolean' then
      raise exception 'Please complete the health questionnaire.';
    end if;
  end loop;
  birth_date := (application ->> 'dob')::date;
  if birth_date > current_date or birth_date < (current_date - interval '120 years')::date then
    raise exception 'Invalid date of birth.';
  end if;
  if birth_date > (current_date - interval '18 years')::date then
    foreach field in array array['guardianName','guardianNric','guardianRelationship','guardianPhone'] loop
      if nullif(btrim(application ->> field), '') is null then
        raise exception 'Guardian information is required for members under 18.';
      end if;
    end loop;
  end if;
  if coalesce(application ->> 'guardianNric', '') <> ''
     and (application ->> 'guardianNric') !~ '^[STFGM][0-9]{7}[A-Z]$' then
    raise exception 'Invalid guardian NRIC.';
  end if;
  if coalesce(application ->> 'guardianPhone', '') <> ''
     and (application ->> 'guardianPhone') !~ '^[0-9]{8}$' then
    raise exception 'Invalid guardian phone number.';
  end if;
  centre := (application ->> 'principalDojo')::uuid;
  if not exists (select 1 from public.centres where id = centre and status = 'active') then
    raise exception 'Please select an active dojo.';
  end if;

  select * into member from public.students where user_id = caller for update;
  -- An application must never demote, promote or overwrite an active membership.
  if not found or member.membership_status <> 'active' then
    if member.id is null then
      member.id := gen_random_uuid();
      insert into public.students (id, user_id, member_no, first_name, last_name, email,
        phone, home_centre_id, date_of_birth, membership_status, joined_at)
      values (member.id, caller, member.id::text, split_part(full_name, ' ', 1),
        btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), account.email,
        application ->> 'mobile', centre, birth_date, 'pending', current_date);
    else
      update public.students set first_name = split_part(full_name, ' ', 1),
        last_name = btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)),
        phone = application ->> 'mobile', home_centre_id = centre, date_of_birth = birth_date,
        membership_status = 'pending', updated_at = now()
      where id = member.id;
    end if;
    -- Claimed belt rank is saved for review, never used to self-award a grade.
    insert into membership_private.application_details (student_id, user_id, form_data)
    values (member.id, caller, application || jsonb_build_object('email', account.email))
    on conflict (student_id) do update set form_data = excluded.form_data, submitted_at = now();

    delete from public.emergency_contacts where student_id = member.id and is_primary;
    insert into public.emergency_contacts (student_id, name, relationship, phone, is_primary)
    values (member.id, application ->> 'emergencyName', application ->> 'emergencyRelationship',
      application ->> 'emergencyPhone', true);
    if nullif(btrim(application ->> 'medicalDetails'), '') is not null and not exists (
      select 1 from public.student_medical_alerts where student_id = member.id
        and active and description = btrim(application ->> 'medicalDetails')
    ) then
      insert into public.student_medical_alerts (student_id, description)
      values (member.id, btrim(application ->> 'medicalDetails'));
    end if;
  end if;

  -- Never reset purchased credits, unlimited status or account activation on retry.
  insert into public.credit_accounts (user_id, credits, unlimited, active, membership_type)
  values (caller, 0, false, false, application_type) on conflict (user_id) do nothing;
  select * into member from public.students where id = member.id;
  return jsonb_build_object('membershipId', member.member_no, 'startDate', member.joined_at,
    'status', member.membership_status, 'beltRank',
    (select label from public.grades where id = member.current_grade_id));
end; $$;
revoke all on function membership_private.submit_application(jsonb) from public, anon, authenticated;
grant execute on function membership_private.submit_application(jsonb) to authenticated;

create or replace function public.submit_my_membership_application(application jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select membership_private.submit_application(application);
$$;
revoke all on function public.submit_my_membership_application(jsonb) from public, anon, authenticated;
grant execute on function public.submit_my_membership_application(jsonb) to authenticated;
notify pgrst, 'reload schema';
