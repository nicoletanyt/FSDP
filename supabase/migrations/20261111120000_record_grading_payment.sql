-- Persist a grading application after the student portal has confirmed payment.
-- The portal currently simulates card authorisation; production should mark the
-- application from the Stripe webhook only after signature and amount checks.
--
-- The existing grading_applications table has no amount_paid/payment_date
-- columns and its application_status enum has no 'paid' value, so a paid
-- application is stored as the normal paid-and-submitted state ('submitted').
create or replace function public.record_grading_payment(
  p_grading_event_id uuid default null,
  p_target_grade_id text default null
)
returns table (
  application_id uuid,
  grading_event_id uuid,
  target_grade_id text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_student_id uuid;
  v_event_id uuid;
  v_target_grade_id text;
  v_application_id uuid;
  v_submitted_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select s.id into v_student_id
  from public.students s
  where s.user_id = v_user_id;

  if v_student_id is null then
    raise exception 'Student profile not found';
  end if;

  -- A retried payment should return the already-saved application.
  if p_grading_event_id is not null then
    select a.id, a.target_grade_id, a.submitted_at
    into v_application_id, v_target_grade_id, v_submitted_at
    from public.grading_applications a
    where a.student_id = v_student_id and a.grading_event_id = p_grading_event_id;

    if v_application_id is not null then
      return query select v_application_id, p_grading_event_id, v_target_grade_id, v_submitted_at;
      return;
    end if;
  end if;

  if p_grading_event_id is null then
    -- Fall back to the signed-in student's next eligible opportunity.
    select o.id, o.target_grade
    into v_event_id, v_target_grade_id
    from public.my_grading_opportunities() o
    where o.applied = false
    order by o.grading_date nulls last, o.id
    limit 1;

    if v_event_id is null then
      raise exception 'No open grading application found';
    end if;
  else
    v_event_id := p_grading_event_id;

    select e.target_grade_id into v_target_grade_id
    from public.eligible_grading_students(v_event_id) e
    where e.student_id = v_student_id;

    if v_target_grade_id is null then
      raise exception 'Student is not eligible for this grading';
    end if;
  end if;

  if p_target_grade_id is not null and p_target_grade_id <> v_target_grade_id then
    raise exception 'Target grade does not match the eligible grade';
  end if;

  insert into public.grading_applications (student_id, grading_event_id, target_grade_id, status, notes)
  values (v_student_id, v_event_id, v_target_grade_id, 'submitted', 'Payment confirmed in student portal')
  on conflict on constraint grading_applications_student_id_grading_event_id_key do nothing
  returning grading_applications.id, grading_applications.submitted_at into v_application_id, v_submitted_at;

  if v_application_id is null then
    select a.id, a.submitted_at into v_application_id, v_submitted_at
    from public.grading_applications a
    where a.student_id = v_student_id and a.grading_event_id = v_event_id;
  end if;

  return query select v_application_id, v_event_id, v_target_grade_id, v_submitted_at;
end;
$$;

comment on function public.record_grading_payment(uuid, text) is
  'Records the signed-in student''s paid grading application. Simulated portal payments only; production must use the Stripe webhook.';

revoke all on function public.record_grading_payment(uuid, text) from public, anon;
grant execute on function public.record_grading_payment(uuid, text) to authenticated;
