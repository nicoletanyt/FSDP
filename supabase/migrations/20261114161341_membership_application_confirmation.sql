-- Confirmation displays the saved application, not a hard-coded belt or the
-- student's separate verified grade. No private identity/medical data is exposed.
begin;

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
    'beltRank', case d.form_data ->> 'currentBelt'
      when 'white' then 'White Belt (Mukyu)'
      when 'yellow' then 'Yellow Belt'
      when 'orange' then 'Orange Belt'
      when 'green' then 'Green Belt'
      when 'blue' then 'Blue Belt'
      when 'brown' then 'Brown Belt'
      when 'black' then 'Black Belt'
      else null
    end,
    'verifiedRank', g.label
  ) into confirmation
  from public.students s
  left join membership_private.application_details d
    on d.student_id = s.id and d.user_id = caller
  left join public.grades g on g.id = s.current_grade_id
  where s.user_id = caller;

  return confirmation;
end; $$;

revoke all on function membership_private.read_application_confirmation()
  from public, anon, authenticated;
grant execute on function membership_private.read_application_confirmation()
  to authenticated;

create or replace function public.get_my_membership_application()
returns jsonb language sql security invoker set search_path = '' as $$
  select membership_private.read_application_confirmation();
$$;
revoke all on function public.get_my_membership_application()
  from public, anon, authenticated;
grant execute on function public.get_my_membership_application()
  to authenticated;

-- Keep all existing writes and ASJ allocation. The returned belt now comes from
-- the committed application snapshot instead of the verified student grade.
create or replace function public.submit_my_membership_application(application jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  result jsonb;
begin
  result := membership_private.submit_formatted_application(application);
  return result || membership_private.read_application_confirmation();
end; $$;
revoke all on function public.submit_my_membership_application(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_my_membership_application(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
commit;
