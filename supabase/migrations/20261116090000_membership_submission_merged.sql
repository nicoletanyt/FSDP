-- Merge of two same-day changes to the membership submission wrapper:
--   20261116063221_membership_current_grade   (canonical current grade)
--   20261116075932_membership_application_names_and_grades (first/last name,
--                                                           editable contact email)
-- Both replaced membership_private.submit_formatted_application and
-- read_application_confirmation, so whichever ran last silently dropped the
-- other's behaviour. This runs after both (and after the grade-sync trigger in
-- 20261116084104) and defines the union. Safe to re-run.
begin;

do $$
begin
  if to_regprocedure('membership_private.submit_application(jsonb)') is null
     or to_regprocedure('membership_private.resolve_current_grade(jsonb)') is null then
    raise exception 'Apply membership_application_submit and membership_current_grade first.';
  end if;
end; $$;

create or replace function membership_private.submit_formatted_application(application jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  result jsonb;
  before_member public.students%rowtype;
  saved public.students%rowtype;
  selected_grade text;
  given_name text := btrim(application ->> 'firstName');
  family_name text := btrim(application ->> 'lastName');
  contact_email text := lower(btrim(application ->> 'email'));
begin
  if caller is null then raise exception 'Please sign in again.'; end if;
  perform 1 from public.users where id = caller and role = 'student' for update;
  if not found then raise exception 'Only student accounts can apply for membership.'; end if;

  -- Names: older clients send only fullName; newer ones send both parts.
  if (application ? 'firstName' or application ? 'lastName') and (
       nullif(given_name, '') is null or nullif(family_name, '') is null
       or char_length(given_name) > 50 or char_length(family_name) > 50) then
    raise exception 'Enter a first and last name of up to 50 characters each.';
  end if;
  -- Contact email: prefilled from the account but editable. Blank or absent
  -- keeps the account email (older clients never sent one).
  if nullif(contact_email, '') is not null and (
       char_length(contact_email) > 254 or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid email address.';
  end if;

  -- Grade: canonical catalogue id (legacy colours resolved only when unambiguous).
  selected_grade := membership_private.resolve_current_grade(application);
  select * into before_member from public.students where user_id = caller for update;
  result := membership_private.submit_application(application || jsonb_build_object(
    'currentBelt', coalesce(nullif(btrim(application ->> 'currentBelt'), ''), selected_grade),
    'current_grade_id', selected_grade));

  -- Only rows submit_application just wrote (pending) are touched; an active or
  -- expired membership, and any grading history, are never changed here.
  update public.students set current_grade_id = selected_grade, updated_at = now()
    where user_id = caller and membership_status = 'pending'
      and (before_member.id is null or before_member.membership_status = 'pending')
      and last_graded_at is null;

  -- submit_application splits fullName at the first space; store the parts as entered.
  if nullif(given_name, '') is not null then
    update public.students set first_name = given_name, last_name = family_name, updated_at = now()
      where user_id = caller and membership_status = 'pending';
  end if;

  -- submit_application stores the account email; keep the student's edited one on
  -- the student row and the private snapshot. The sign-in email is never changed.
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
  return result || jsonb_build_object('membershipId', saved.member_no,
    'startDate', saved.joined_at, 'current_grade_id', saved.current_grade_id,
    'beltRank', (select label from public.grades where id = saved.current_grade_id));
end $$;
revoke all on function membership_private.submit_formatted_application(jsonb) from public, anon, authenticated;
grant execute on function membership_private.submit_formatted_application(jsonb) to authenticated;

-- 20261116063221's confirmation (a superset of 20261116075932's): canonical
-- grade ids, legacy colours, and the verified grade as the last fallback.
create or replace function membership_private.read_application_confirmation()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); confirmation jsonb;
begin
  if caller is null or not exists(select 1 from public.users where id = caller and role = 'student') then
    raise exception 'Student authentication required.';
  end if;
  select jsonb_build_object('membershipId', s.member_no, 'startDate', s.joined_at,
    'status', s.membership_status, 'declaredBelt', d.form_data ->> 'currentBelt',
    'current_grade_id', s.current_grade_id,
    'beltRank', coalesce(declared_grade.label, case d.form_data ->> 'currentBelt'
      when 'white' then 'White Belt (Mukyu)' when 'yellow' then 'Yellow Belt'
      when 'orange' then 'Orange Belt' when 'green' then 'Green Belt'
      when 'blue' then 'Blue Belt' when 'brown' then 'Brown Belt'
      when 'black' then 'Black Belt' else g.label end),
    'verifiedRank', g.label) into confirmation
  from public.students s
  left join membership_private.application_details d on d.student_id = s.id and d.user_id = caller
  left join public.grades g on g.id = s.current_grade_id
  left join public.grades declared_grade on declared_grade.id = d.form_data ->> 'currentBelt'
  where s.user_id = caller;
  return confirmation;
end $$;
revoke all on function membership_private.read_application_confirmation() from public, anon, authenticated;
grant execute on function membership_private.read_application_confirmation() to authenticated;

notify pgrst, 'reload schema';
commit;
