begin;

-- Membership submission stores its complete form in a private schema. Return
-- only the grading allowlist for the authenticated owner, never the full JSON
-- (which also contains NRIC, address, guardian data and health questionnaire).
create or replace function public.my_grading_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'full_name', coalesce(nullif(btrim(d.form_data ->> 'fullName'), ''), btrim(s.first_name || ' ' || s.last_name)),
    'phone', coalesce(nullif(btrim(d.form_data ->> 'mobile'), ''), s.phone, ''),
    'emergency_name', coalesce(nullif(btrim(d.form_data ->> 'emergencyName'), ''), c.name, ''),
    'emergency_relationship', coalesce(nullif(btrim(d.form_data ->> 'emergencyRelationship'), ''), c.relationship, ''),
    'emergency_phone', coalesce(nullif(btrim(d.form_data ->> 'emergencyPhone'), ''), c.phone, ''),
    'medical_details', coalesce((
      select string_agg(note, E'\n' order by priority, note) from (
        select note, min(priority) as priority from (
          select nullif(btrim(d.form_data ->> 'medicalDetails'), '') as note, 0 as priority
          union all
          select nullif(btrim(a.description), ''), 1 from public.student_medical_alerts a
          where a.student_id = s.id and a.active
        ) notes where note is not null group by note
      ) distinct_notes
    ), ''),
    'recorded_medical_details', coalesce((
      select jsonb_agg(a.description order by a.recorded_at, a.id)
      from public.student_medical_alerts a
      where a.student_id = s.id and a.active and not a.student_reported
    ), '[]'::jsonb)
  )
  from public.students s
  left join membership_private.application_details d
    on d.student_id = s.id and d.user_id = s.user_id
  left join public.emergency_contacts c on c.student_id = s.id and c.is_primary
  where s.user_id = (select auth.uid())
    and (select public.current_user_role()) = 'student';
$$;
revoke all on function public.my_grading_profile() from public, anon;
grant execute on function public.my_grading_profile() to authenticated;

-- Grading is read-only. Profile editing elsewhere still uses the existing
-- update_my_student_profile RPC, with its original ownership checks unchanged.
revoke all on function public.save_my_grading_profile(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
