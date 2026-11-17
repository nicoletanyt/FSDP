-- The application form now collects first and last names separately, lets the
-- student edit the prefilled contact email, and picks the declared belt from
-- public.grades. Requires persist_asj_membership_id and
-- membership_application_confirmation.
begin;

do $$
begin
  if to_regprocedure('membership_private.submit_application(jsonb)') is null
     or to_regprocedure('membership_private.read_application_confirmation()') is null then
    raise exception 'Please apply the earlier membership application migrations first.';
  end if;
end; $$;

create or replace function membership_private.submit_formatted_application(application jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  result jsonb;
  saved public.students%rowtype;
  given_name text := btrim(application ->> 'firstName');
  family_name text := btrim(application ->> 'lastName');
  belt text := application ->> 'currentBelt';
  contact_email text := lower(btrim(application ->> 'email'));
begin
  if caller is null then raise exception 'Please sign in again.'; end if;
  -- Older clients send only fullName; newer ones send both name parts.
  if (application ? 'firstName' or application ? 'lastName') and (
       nullif(given_name, '') is null or nullif(family_name, '') is null
       or char_length(given_name) > 50 or char_length(family_name) > 50) then
    raise exception 'Enter a first and last name of up to 50 characters each.';
  end if;
  -- The declared belt is a grade id (or a legacy colour value from older clients).
  if belt is not null
     and belt not in ('white','yellow','orange','green','blue','brown','black')
     and not exists (select 1 from public.grades where id = belt) then
    raise exception 'Select your current belt from the list.';
  end if;

  -- The contact email is prefilled from the account but editable. An absent or
  -- blank value keeps the account email (older clients never sent one).
  if nullif(contact_email, '') is not null and (
       char_length(contact_email) > 254 or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid email address.';
  end if;

  result := membership_private.submit_application(application);

  -- submit_application splits fullName at the first space, which breaks
  -- multi-word first names. Store the parts as entered. Only rows it just
  -- wrote (now pending) are touched; an active membership is never changed.
  if nullif(given_name, '') is not null then
    update public.students
      set first_name = given_name,
          last_name = family_name,
          updated_at = now()
    where user_id = caller and membership_status = 'pending';
  end if;
  -- submit_application stores the account email; keep the student's edited one
  -- instead, on the student row and the saved snapshot. The sign-in email
  -- (public.users / auth) is never changed here.
  if nullif(contact_email, '') is not null then
    begin
      update public.students set email = contact_email, updated_at = now()
      where user_id = caller and membership_status = 'pending';
    exception when unique_violation then
      raise exception 'That email address is already used by another member. Enter a different one.';
    end;
    update membership_private.application_details d
      set form_data = d.form_data || jsonb_build_object('email', contact_email)
    from public.students s
    where d.student_id = s.id and s.user_id = caller and s.membership_status = 'pending';
  end if;

  -- The UPDATE intentionally fires the allocator for legacy UUID numbers.
  update public.students set member_no = id::text
  where user_id = caller and member_no = id::text;

  select * into saved from public.students where user_id = caller;
  if not found then raise exception 'Membership record was not saved.'; end if;
  return result || jsonb_build_object(
    'membershipId', saved.member_no,
    'startDate', saved.joined_at
  );
end; $$;

revoke all on function membership_private.submit_formatted_application(jsonb)
  from public, anon, authenticated;
grant execute on function membership_private.submit_formatted_application(jsonb)
  to authenticated;

-- Confirmation shows the declared grade's label; legacy colour values still map.
create or replace function membership_private.read_application_confirmation()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  confirmation jsonb;
begin
  if caller is null or not exists (
    select 1 from public.users where id = caller and role = 'student'
  ) then
    raise exception 'Student authentication required.';
  end if;

  select jsonb_build_object(
    'membershipId', s.member_no,
    'startDate', s.joined_at,
    'status', s.membership_status,
    'declaredBelt', d.form_data ->> 'currentBelt',
    'beltRank', coalesce(declared.label, case d.form_data ->> 'currentBelt'
      when 'white' then 'White Belt (Mukyu)'
      when 'yellow' then 'Yellow Belt'
      when 'orange' then 'Orange Belt'
      when 'green' then 'Green Belt'
      when 'blue' then 'Blue Belt'
      when 'brown' then 'Brown Belt'
      when 'black' then 'Black Belt'
      else null
    end),
    'verifiedRank', g.label
  ) into confirmation
  from public.students s
  left join membership_private.application_details d
    on d.student_id = s.id and d.user_id = caller
  left join public.grades declared on declared.id = d.form_data ->> 'currentBelt'
  left join public.grades g on g.id = s.current_grade_id
  where s.user_id = caller;

  return confirmation;
end; $$;

revoke all on function membership_private.read_application_confirmation()
  from public, anon, authenticated;
grant execute on function membership_private.read_application_confirmation()
  to authenticated;

notify pgrst, 'reload schema';
commit;
