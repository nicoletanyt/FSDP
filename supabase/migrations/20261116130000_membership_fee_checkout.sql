-- Membership fees are paid online: a dedicated checkout sends the fee id, and the
-- verified webhook extends the membership by the months that fee covers. Unlike a
-- class pass, this never adds credits.
--
-- The expiry is extended from the later of today and the current expiry, so an
-- early renewal keeps the time already paid for. A Stripe webhook replay must not
-- extend twice, so the paid payment row is the idempotency guard.

create or replace function public.finalize_membership_fee(
  student uuid,
  stripe_session text,
  fee_title text,
  months integer,
  paid_amount integer,
  paid_currency text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  existing_status public.payment_status;
  existing_student uuid;
begin
  if stripe_session is null
    or paid_amount is null
    or paid_amount <= 0
    or months is null
    or months < 1
    or months > 120
    or paid_currency is null
    or paid_currency !~ '^[A-Za-z]{3}$'
  then
    raise exception 'Invalid membership payment';
  end if;

  -- The student row is what gets extended; fail before recording anything.
  perform 1
  from public.students s
  where s.id = student and s.user_id is not null
  for update;
  if not found then raise exception 'Unknown membership student'; end if;

  -- Checkout writes a pending row that is marked paid here. An already-paid row
  -- means Stripe is retrying an event we applied, so the expiry must not move.
  select p.status, p.student_id into existing_status, existing_student
  from public.payments p
  where p.stripe_session_id = stripe_session
  for update;

  if found then
    if existing_student is distinct from student then
      raise exception 'Membership payment belongs to another student';
    end if;
    if existing_status = 'paid' then return; end if;
    update public.payments p
      set status = 'paid',
          paid_at = now(),
          amount_cents = paid_amount,
          currency = lower(paid_currency),
          description = left(coalesce(nullif(trim(fee_title), ''), 'Membership fee'), 200)
      where p.stripe_session_id = stripe_session;
  else
    insert into public.payments (
      student_id, item, description, amount_cents, currency, status, stripe_session_id, paid_at
    ) values (
      student, 'Membership',
      left(coalesce(nullif(trim(fee_title), ''), 'Membership fee'), 200),
      paid_amount, lower(paid_currency), 'paid', stripe_session, now()
    );
  end if;

  update public.students s
    set membership_status = 'active',
        membership_expires_on = (
          greatest(coalesce(s.membership_expires_on, current_date), current_date)
          + make_interval(months => months)
        )::date,
        updated_at = now()
    where s.id = student;
end; $$;

revoke all on function public.finalize_membership_fee(uuid, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.finalize_membership_fee(uuid, text, text, integer, integer, text)
  to service_role;

-- The registration checkout (applications) is the same payment, fixed at 12 months.
-- Delegating keeps its old signature working for the webhook while gaining replay safety.
create or replace function public.finalize_membership_checkout(
  student uuid, stripe_session text, paid_amount integer, paid_currency text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.finalize_membership_fee(
    student, stripe_session, 'Membership fee', 12, paid_amount, paid_currency
  );
end; $$;

revoke all on function public.finalize_membership_checkout(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.finalize_membership_checkout(uuid, text, integer, text)
  to service_role;
