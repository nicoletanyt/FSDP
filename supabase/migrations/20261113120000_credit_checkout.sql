-- Credit pass purchases: Stripe Checkout records a pass purchase and tops up the
-- student's credit account. Only the verified Stripe webhook may finalize a
-- purchase; browsers can read their own rows but never write them.

-- The cloud project already has credit_accounts; this keeps a fresh database
-- consistent with the credit top-up flow. Existing installations are untouched.
create table if not exists public.credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  unlimited boolean not null default false,
  active boolean not null default true,
  membership_type text not null default 'adult'
);

create table if not exists public.credit_purchases (
  stripe_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pass_id text not null check (char_length(pass_id) between 1 and 60),
  pass_title text not null check (char_length(pass_title) between 1 and 120),
  credits integer not null default 0 check (credits >= 0),
  unlimited boolean not null default false,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'sgd' check (currency ~ '^[a-z]{3}$'),
  created_at timestamptz not null default now()
);

create index if not exists credit_purchases_user_created_at_idx
  on public.credit_purchases (user_id, created_at desc);

alter table public.credit_accounts enable row level security;
alter table public.credit_purchases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credit_accounts' and cmd = 'SELECT'
  ) then
    create policy "Students read own credit account"
      on public.credit_accounts for select to authenticated
      using (user_id = auth.uid() or public.is_administrator());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credit_purchases'
      and policyname = 'Students read own credit purchases'
  ) then
    create policy "Students read own credit purchases"
      on public.credit_purchases for select to authenticated
      using (user_id = auth.uid() or public.is_administrator());
  end if;
end $$;

revoke all on public.credit_accounts from public, anon, authenticated;
revoke all on public.credit_purchases from public, anon, authenticated;
grant select on public.credit_accounts to authenticated;
grant select on public.credit_purchases to authenticated;
grant select, insert, update, delete on public.credit_accounts to service_role;
grant select, insert, update, delete on public.credit_purchases to service_role;

-- Called only by the Stripe webhook after it re-verifies the paid session.
-- The purchase row is the idempotency gate: repeated and concurrent deliveries
-- grant the pass exactly once.
create or replace function public.finalize_credit_checkout(
  auth_user uuid,
  stripe_session text,
  pass_id text,
  pass_title text,
  credits integer,
  unlimited boolean,
  membership_type text,
  paid_amount integer,
  paid_currency text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  credits_to_add integer;
begin
  if auth_user is null or stripe_session is null or pass_id is null or pass_title is null
     or paid_amount is null or paid_amount <= 0 or paid_currency is null then
    raise exception 'Invalid credit purchase';
  end if;
  if credits is null or credits < 0 then
    raise exception 'Invalid credit amount';
  end if;
  if membership_type is null or membership_type not in ('adult', 'junior', 'student', 'senior') then
    membership_type := 'adult';
  end if;
  if not exists (select 1 from public.users u where u.id = auth_user and u.role = 'student') then
    raise exception 'Unknown student account';
  end if;

  credits_to_add := case when unlimited then 0 else credits end;

  insert into public.credit_purchases (
    stripe_session_id, user_id, pass_id, pass_title, credits, unlimited, amount_cents, currency
  ) values (
    stripe_session, auth_user, pass_id, pass_title, credits, unlimited, paid_amount, lower(paid_currency)
  )
  on conflict (stripe_session_id) do nothing;

  if not found then
    return;
  end if;

  insert into public.credit_accounts as account (user_id, credits, unlimited, active, membership_type)
  values (auth_user, credits_to_add, unlimited, true, membership_type)
  on conflict (user_id) do update set
    credits = case
      when account.unlimited then account.credits
      when excluded.unlimited then 0
      else account.credits + excluded.credits
    end,
    unlimited = account.unlimited or excluded.unlimited,
    active = true;

  insert into public.payments (
    student_id, item, description, amount_cents, currency, status, stripe_session_id, paid_at
  )
  select s.id, 'Class pass', pass_title, paid_amount, lower(paid_currency), 'paid', stripe_session, now()
  from public.students s
  where s.user_id = auth_user
  on conflict (stripe_session_id) do nothing;
end; $$;

revoke all on function public.finalize_credit_checkout(uuid, text, text, text, integer, boolean, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.finalize_credit_checkout(uuid, text, text, text, integer, boolean, text, integer, text)
  to service_role;
