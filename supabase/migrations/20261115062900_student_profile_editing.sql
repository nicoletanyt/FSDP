-- Students update their own contact details: phone number and primary
-- emergency contact. Everything else on the profile stays staff-managed:
-- name, date of birth, dojo and email affect identity and grading; address is
-- not editable; medical alerts are indicators recorded for instructors/admins.
--
-- `details` may contain either or both keys; only the keys present change:
--   { "phone": "+65 9123 4567",
--     "emergency_contact": { "name": "...", "relationship": "...", "phone": "..." } }

-- Digits with optional leading +, spaces, hyphens and brackets; 6-15 digits.
create function public.is_valid_contact_phone(value text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    char_length(value) <= 30
    and value ~ '^\+?[0-9][0-9 ()-]*$'
    and char_length(regexp_replace(value, '[^0-9]', '', 'g')) between 6 and 15,
  false);
$$;

create function public.update_my_student_profile(details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  member public.students%rowtype;
  new_phone text;
  contact jsonb;
  contact_name text;
  contact_relationship text;
  contact_phone text;
  saved public.emergency_contacts%rowtype;
begin
  if (select public.current_user_role()) is distinct from 'student' then
    raise exception 'Sign in as a student to update your profile.';
  end if;
  if details is null or jsonb_typeof(details) <> 'object'
    or not (details ? 'phone' or details ? 'emergency_contact') then
    raise exception 'Nothing to update.';
  end if;
  if exists (select 1 from jsonb_object_keys(details) k where k not in ('phone', 'emergency_contact')) then
    raise exception 'Only your phone number and emergency contact can be changed here.';
  end if;

  select * into member from public.students where user_id = (select auth.uid()) for update;
  if not found then raise exception 'Your account is not linked to a student record.'; end if;

  if details ? 'phone' then
    new_phone := trim(coalesce(details ->> 'phone', ''));
    if not public.is_valid_contact_phone(new_phone) then
      raise exception 'Enter a valid phone number.';
    end if;
    update public.students set phone = new_phone, updated_at = now() where id = member.id;
  end if;

  if details ? 'emergency_contact' then
    contact := details -> 'emergency_contact';
    if jsonb_typeof(contact) <> 'object' then raise exception 'Complete your emergency contact details.'; end if;
    contact_name := left(trim(coalesce(contact ->> 'name', '')), 100);
    contact_relationship := left(trim(coalesce(contact ->> 'relationship', '')), 50);
    contact_phone := trim(coalesce(contact ->> 'phone', ''));
    if contact_name = '' or contact_relationship = '' then
      raise exception 'Complete your emergency contact details.';
    end if;
    if not public.is_valid_contact_phone(contact_phone) then
      raise exception 'Enter a valid emergency contact number.';
    end if;
    update public.emergency_contacts
      set name = contact_name, relationship = contact_relationship, phone = contact_phone
      where student_id = member.id and is_primary
      returning * into saved;
    if not found then
      insert into public.emergency_contacts (student_id, name, relationship, phone, is_primary)
      values (member.id, contact_name, contact_relationship, contact_phone, true)
      returning * into saved;
    end if;
    update public.students set updated_at = now() where id = member.id;
  end if;

  return jsonb_build_object(
    'phone', (select phone from public.students where id = member.id),
    'emergency_contact', (
      select jsonb_build_object('name', e.name, 'relationship', e.relationship, 'phone', e.phone)
      from public.emergency_contacts e where e.student_id = member.id and e.is_primary
    )
  );
end $$;

revoke all on function public.update_my_student_profile(jsonb) from public, anon;
grant execute on function public.update_my_student_profile(jsonb) to authenticated;
revoke all on function public.is_valid_contact_phone(text) from public, anon;
grant execute on function public.is_valid_contact_phone(text) to authenticated;
