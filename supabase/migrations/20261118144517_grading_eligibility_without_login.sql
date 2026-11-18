-- Eligibility is based on grading readiness, not possession of a login.
-- Student-initiated application and checkout remain scoped to their linked
-- account by my_grading_opportunities and reserve_grading_checkout.
create or replace function public.eligible_grading_students(target_event uuid)
returns table(student_id uuid, user_id uuid, email text, target_grade_id text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.email, ready.target_grade_id
  from public.gradings gr
  join public.events e on e.id = gr.event_id
  join public.students s on s.membership_status = 'active' and not s.outstanding_fees
    and (s.home_centre_id = e.centre_id or gr.official_schedule)
  join lateral (
    select r.target_grade_id, r.track
    from public.student_grading_readiness(s.id) r
    group by r.target_grade_id, r.track having bool_and(r.met)
  ) ready on ready.track = gr.track
  join public.grading_target_grades tgt on tgt.grading_event_id = e.id and tgt.grade_id = ready.target_grade_id
  where gr.event_id = target_event and gr.application_status = 'open' and e.status = 'scheduled'
    and (gr.grading_date is null and e.starts_at > now()
      or gr.grading_date > (now() at time zone 'Asia/Singapore')::date)
    and (gr.application_opens_on is null or gr.application_opens_on <= (now() at time zone 'Asia/Singapore')::date)
    and not exists (select 1 from public.grading_applications a where a.student_id = s.id and a.grading_event_id = e.id);
$$;

-- Keep this definer function private; admins reach it through the guarded
-- admin RPC, while trusted checkout/invitation services call it directly.
revoke all on function public.eligible_grading_students(uuid) from public, anon, authenticated;
grant execute on function public.eligible_grading_students(uuid) to service_role;
