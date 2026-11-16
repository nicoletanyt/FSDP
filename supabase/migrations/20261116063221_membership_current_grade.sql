begin;

-- Resolve exact catalogue IDs first. Support the old colour-only form only
-- where it identifies a specific Kyu; never guess which Dan "black" means.
create function membership_private.resolve_current_grade(application jsonb)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare
  explicit_id text := nullif(btrim(application ->> 'current_grade_id'), '');
  declared text := nullif(btrim(application ->> 'currentBelt'), '');
  resolved text;
  candidates text[];
  matches integer;
begin
  if explicit_id is not null and not exists(select 1 from public.grades where id = explicit_id) then
    raise exception 'Invalid current grade. Select a grade from the catalogue.';
  end if;
  if declared is not null then
    select id into resolved from public.grades where id = declared;
    if resolved is null then
      candidates := case lower(declared)
        when 'white' then array['unranked']
        when 'yellow' then array['yellow-10th-kyu','10-kyu']
        when 'orange' then array['orange-9th-kyu','9-kyu']
        when 'green' then array['green-8th-kyu','8-kyu']
        when 'blue' then array['blue-6th-kyu','6-kyu']
        when 'brown' then array['brown-4th-kyu','4-kyu']
        else array[]::text[] end;
      select count(*), min(g.id) into matches, resolved from public.grades g
        where g.id = any(candidates) or lower(g.label) = lower(declared);
      if matches <> 1 then
        raise exception 'Invalid or ambiguous current belt. Select the exact Kyu or Dan grade from the catalogue.';
      end if;
    end if;
    if explicit_id is not null and explicit_id <> resolved then
      raise exception 'Current belt and current grade must identify the same grade.';
    end if;
  end if;
  resolved := coalesce(explicit_id, resolved);
  if resolved is null then raise exception 'Select your current grade.'; end if;
  return resolved;
end $$;
revoke all on function membership_private.resolve_current_grade(jsonb) from public,anon,authenticated;

-- Preserve the full existing validation/contact/private-form/credit transaction
-- and ASJ allocation. Write the selected initial grade in that same transaction,
-- before the public RPC returns. Active/expired existing ranks are not changed
-- by resubmitting Membership; subsequent promotions remain dojo-managed.
create or replace function membership_private.submit_formatted_application(application jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  result jsonb;
  before_member public.students%rowtype;
  saved public.students%rowtype;
  selected_grade text;
begin
  if caller is null then raise exception 'Please sign in again.'; end if;
  perform 1 from public.users where id = caller and role = 'student' for update;
  if not found then raise exception 'Only student accounts can apply for membership.'; end if;
  selected_grade := membership_private.resolve_current_grade(application);
  select * into before_member from public.students where user_id = caller for update;
  -- The original validator accepts currentBelt; normalize current_grade_id-only
  -- callers and persist the canonical ID in the private snapshot as well.
  result := membership_private.submit_application(application || jsonb_build_object(
    'currentBelt', coalesce(nullif(btrim(application ->> 'currentBelt'), ''), selected_grade),
    'current_grade_id', selected_grade));

  update public.students set current_grade_id = selected_grade, updated_at = now()
    where user_id = caller and membership_status = 'pending'
      and (before_member.id is null or before_member.membership_status = 'pending')
      and last_graded_at is null;
  update public.students set member_no = id::text
    where user_id = caller and member_no = id::text;
  select * into saved from public.students where user_id = caller;
  if not found then raise exception 'Membership record was not saved.'; end if;
  return result || jsonb_build_object('membershipId', saved.member_no,
    'startDate', saved.joined_at, 'current_grade_id', saved.current_grade_id,
    'beltRank', (select label from public.grades where id = saved.current_grade_id));
end $$;
revoke all on function membership_private.submit_formatted_application(jsonb) from public,anon,authenticated;
grant execute on function membership_private.submit_formatted_application(jsonb) to authenticated;

-- Confirmation must understand canonical IDs, not just the old seven colours.
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
revoke all on function membership_private.read_application_confirmation() from public,anon,authenticated;
grant execute on function membership_private.read_application_confirmation() to authenticated;

-- Repair only the old untouched default, using this student's saved submission.
-- Never replace an existing ranked grade or a record with a grading history.
-- Ambiguous historical colours stay unchanged for manual dojo confirmation.
do $$
declare entry record; selected_grade text;
begin
  for entry in select s.id, d.form_data from public.students s
    join membership_private.application_details d on d.student_id = s.id and d.user_id = s.user_id
    where (s.current_grade_id is null or s.current_grade_id = 'unranked') and s.last_graded_at is null
    for update of s
  loop
    begin
      selected_grade := membership_private.resolve_current_grade(entry.form_data);
    exception when raise_exception then continue;
    end;
    update public.students set current_grade_id = selected_grade, updated_at = now()
      where id = entry.id and (current_grade_id is null or current_grade_id = 'unranked') and last_graded_at is null;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
