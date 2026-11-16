-- Membership fees buy membership time, not class credits. Store the date the
-- membership lapses so the student's Credits page can show it next to their passes.
--
-- Existing members are backfilled from their latest paid membership fee. Imported
-- students who predate Stripe have no payment row, so their join date is the fallback.

alter table public.students add column if not exists membership_expires_on date;

comment on column public.students.membership_expires_on is
  'Singapore date the current membership lapses. Extended by verified membership payments.';

update public.students s
set membership_expires_on = coalesce(
  (
    select max((p.paid_at at time zone 'Asia/Singapore')::date + interval '12 months')::date
    from public.payments p
    where p.student_id = s.id and p.item = 'Membership' and p.status = 'paid'
  ),
  (s.joined_at + interval '12 months')::date
)
where s.membership_expires_on is null
  and s.membership_status in ('active', 'expired');

-- Reactivation and renewal both buy a further 12 months. Renewing before the
-- current expiry keeps the time already paid for instead of restarting from today.
create or replace function public.finalize_membership_checkout(
  student uuid, stripe_session text, paid_amount integer, paid_currency text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if stripe_session is null or paid_amount is null or paid_amount <= 0 then
    raise exception 'Invalid membership payment';
  end if;

  update public.students s
    set membership_status = 'active',
        membership_expires_on = (
          greatest(coalesce(s.membership_expires_on, current_date), current_date)
          + interval '12 months'
        )::date,
        updated_at = now()
    where s.id = student and s.user_id is not null;
  if not found then raise exception 'Unknown membership applicant'; end if;

  insert into public.payments (
    student_id, item, description, amount_cents, currency, status, stripe_session_id, paid_at
  ) values (
    student, 'Membership', 'Membership fee', paid_amount, lower(paid_currency), 'paid', stripe_session, now()
  )
  on conflict (stripe_session_id) do update
    set status = 'paid', paid_at = coalesce(public.payments.paid_at, now()),
        amount_cents = excluded.amount_cents, currency = excluded.currency
    where public.payments.student_id = excluded.student_id;
end; $$;

revoke all on function public.finalize_membership_checkout(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.finalize_membership_checkout(uuid, text, integer, text)
  to service_role;
