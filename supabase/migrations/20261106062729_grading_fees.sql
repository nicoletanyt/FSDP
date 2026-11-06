-- Per-grade grading fees from the Aikido Shinju-Kai Grading SOP (September 2025),
-- replacing the flat SGD 60 charge. The amount is fixed on the checkout attempt
-- when it is reserved, and the webhook must be paid exactly that amount.

alter table public.grade_requirements
  add column fee_cents integer check (fee_cents is null or fee_cents > 0);

update public.grade_requirements r set fee_cents = f.fee_cents
from (values
  ('children', 'red-12th-kyu', 4500),
  ('children', 'red-gold-11th-kyu', 4500),
  ('children', 'yellow-10th-kyu', 4500),
  ('children', 'orange-9th-kyu', 4500),
  ('children', 'green-8th-kyu', 4500),
  ('children', 'purple-7th-kyu', 4500),
  ('children', 'blue-6th-kyu', 5000),
  ('children', 'blue-silver-6th-kyu', 5000),
  ('children', 'blue-gold-5th-kyu', 5500),
  ('children', 'brown-4th-kyu', 6000),
  ('children', 'brown-silver-4th-kyu', 6000),
  ('children', 'brown-gold-3rd-kyu', 6500),
  ('children', 'black-2nd-kyu', 9000),
  ('children', 'black-silver-2nd-kyu', 9000),
  ('adult', 'blue-6th-kyu', 5000),
  ('adult', 'blue-gold-5th-kyu', 5500),
  ('adult', 'brown-4th-kyu', 6000),
  ('adult', 'brown-gold-3rd-kyu', 6500),
  ('adult', 'black-2nd-kyu', 9000),
  ('adult', 'black-gold-1st-kyu', 9500),
  ('adult', 'junior-dan', 21500),
  ('adult', '1st-dan', 53500),
  ('adult', '2nd-dan', 59000),
  ('adult', '3rd-dan', 69500),
  ('adult', '4th-dan', 91000)
) as f(track, grade_id, fee_cents)
where r.track = f.track::public.grade_track and r.grade_id = f.grade_id;

alter table public.grading_checkout_attempts
  add column amount_cents integer check (amount_cents is null or amount_cents > 0);

-- Same eligibility rules as before; now also fixes and returns the fee.
drop function public.reserve_grading_checkout(uuid, uuid);

create function public.reserve_grading_checkout(target_event uuid, auth_user uuid)
returns table(attempt_id uuid, checkout_session text, target_grade text, revision integer, amount integer)
language plpgsql security definer set search_path = '' as $$
declare
  eligible record;
  fee integer;
begin
  select eg.* into eligible from public.eligible_grading_students(target_event) eg where eg.user_id = auth_user;
  if not found then raise exception 'Grading is unavailable or student is ineligible'; end if;

  select r.fee_cents into fee
  from public.gradings gr
  join public.grade_requirements r on r.grade_id = eligible.target_grade_id and r.track = gr.track
  where gr.event_id = target_event;
  if fee is null then raise exception 'Grading fee is not configured for this grade'; end if;

  insert into public.grading_checkout_attempts(student_id, grading_event_id, target_grade_id, amount_cents)
  values (eligible.student_id, target_event, eligible.target_grade_id, fee)
  on conflict(student_id, grading_event_id) do nothing;

  -- Attempts reserved before fees existed get the fee before their first session.
  update public.grading_checkout_attempts a set amount_cents = fee
  where a.student_id = eligible.student_id and a.grading_event_id = target_event
    and a.amount_cents is null and a.stripe_session_id is null and a.status = 'pending';

  return query select a.id, a.stripe_session_id, a.target_grade_id, a.checkout_revision, a.amount_cents
    from public.grading_checkout_attempts a
    where a.student_id = eligible.student_id and a.grading_event_id = target_event;
end; $$;
revoke all on function public.reserve_grading_checkout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_grading_checkout(uuid, uuid) to service_role;

create or replace function public.finalize_grading_checkout(attempt uuid, stripe_session text, paid_amount integer, paid_currency text)
returns void language plpgsql security definer set search_path = '' as $$
declare record_ public.grading_checkout_attempts%rowtype;
begin
  select * into record_ from public.grading_checkout_attempts where id = attempt for update;
  if not found or record_.stripe_session_id is distinct from stripe_session
    or record_.amount_cents is null or paid_amount is distinct from record_.amount_cents
    or lower(paid_currency) <> 'sgd' then
    raise exception 'Payment does not match grading attempt';
  end if;
  if record_.status = 'paid' then return; end if;
  insert into public.grading_applications(student_id, grading_event_id, target_grade_id)
    values (record_.student_id, record_.grading_event_id, record_.target_grade_id)
    on conflict(student_id, grading_event_id) do nothing;
  update public.grading_checkout_attempts set status = 'paid' where id = attempt;
end; $$;
revoke all on function public.finalize_grading_checkout(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_grading_checkout(uuid, text, integer, text) to service_role;
