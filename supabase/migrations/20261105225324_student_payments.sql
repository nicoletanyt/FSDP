-- Payment history for the student profile. Membership checkout records a
-- pending row; the verified Stripe webhook marks it paid. Only server code
-- (service_role) writes here; students read their own rows.

create type public.payment_status as enum ('pending', 'paid', 'refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  item text not null check (char_length(item) between 1 and 100),
  description text not null check (char_length(description) between 1 and 200),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'sgd' check (currency ~ '^[a-z]{3}$'),
  method text not null default 'Stripe',
  status public.payment_status not null default 'pending',
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payments_student_id_created_at_idx on public.payments (student_id, created_at desc);

alter table public.payments enable row level security;

create policy "Students read own payments; administrators read all payments"
on public.payments for select to authenticated
using (public.is_administrator() or student_id = public.current_student_id());

revoke all on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;
grant select, insert, update, delete on public.payments to service_role;

-- Activation now also records the verified amount on the payment row.
drop function public.finalize_membership_checkout(uuid);

create function public.finalize_membership_checkout(
  student uuid, stripe_session text, paid_amount integer, paid_currency text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if stripe_session is null or paid_amount is null or paid_amount <= 0 then
    raise exception 'Invalid membership payment';
  end if;

  update public.students s
    set membership_status = 'active', updated_at = now()
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

revoke all on function public.finalize_membership_checkout(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_membership_checkout(uuid, text, integer, text) to service_role;
;
