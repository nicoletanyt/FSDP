-- Apply after credit_checkout and student_class_booking. This migration never
-- grants browser writes to purchased credits. All amounts are server-owned.
begin;

create schema if not exists credit_private;
revoke all on schema credit_private from public, anon, authenticated;
grant usage on schema credit_private to authenticated;

create table public.credit_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credits_total integer not null check (credits_total >= 0),
  credits_remaining integer not null check (credits_remaining between 0 and credits_total),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unlimited boolean not null default false,
  stripe_session_id text unique references public.credit_purchases(stripe_session_id),
  source text not null default 'purchase' check (source in ('purchase', 'legacy')),
  check (not unlimited or (credits_total = 0 and credits_remaining = 0))
);
create index credit_batches_owner_expiry_idx on public.credit_batches(user_id, expires_at);
create index credit_batches_spend_idx on public.credit_batches
  (user_id, expires_at, created_at, id) where credits_remaining > 0;
create index credit_batches_unlimited_idx on public.credit_batches
  (user_id, expires_at) where unlimited;
alter table public.credit_batches enable row level security;
revoke all on public.credit_batches from public, anon, authenticated;
grant select on public.credit_batches to authenticated;
grant select, insert, update, delete on public.credit_batches to service_role;
create policy "Students read own credit batches" on public.credit_batches
  for select to authenticated using (user_id = (select auth.uid()));

-- Internal booking allocations identify which batch to refund or transfer.
-- No roster FK: cancellation deletes the roster before refunding its allocation.
create table credit_private.booking_allocations (
  event_id uuid not null references public.events(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  batch_id uuid not null references public.credit_batches(id) on delete restrict,
  charged boolean not null,
  primary key (event_id, student_id)
);
alter table credit_private.booking_allocations enable row level security;
create index booking_allocations_student_idx on credit_private.booking_allocations(student_id);
create index booking_allocations_batch_idx on credit_private.booking_allocations(batch_id);
revoke all on credit_private.booking_allocations from public, anon, authenticated;

-- Append-only audit trail for class debits and refunds. Browser users can read
-- only their own transactions, never create or rewrite them.
create table public.credit_batch_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.credit_batches(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  delta integer not null check (delta in (-1, 1)),
  created_at timestamptz not null default now()
);
create index credit_batch_transactions_owner_idx on public.credit_batch_transactions(user_id, created_at);
create index credit_batch_transactions_batch_idx on public.credit_batch_transactions(batch_id);
create index credit_batch_transactions_event_idx on public.credit_batch_transactions(event_id);
alter table public.credit_batch_transactions enable row level security;
revoke all on public.credit_batch_transactions from public, anon, authenticated;
grant select on public.credit_batch_transactions to authenticated;
create policy "Students read own credit transactions" on public.credit_batch_transactions
  for select to authenticated using (user_id = (select auth.uid()));

create table credit_private.pass_validity (
  pass_id text primary key, credits integer not null, unlimited boolean not null,
  validity interval not null check (validity > interval '0')
);
alter table credit_private.pass_validity enable row level security;
revoke all on credit_private.pass_validity from public, anon, authenticated;
insert into credit_private.pass_validity values
  ('adult-10',10,false,interval '11 weeks'),
  ('adult-25',25,false,interval '4 months'),
  ('adult-50',50,false,interval '6 months'),
  ('adult-1y',9999,true,interval '12 months'),
  ('adult-12w',9999,true,interval '12 weeks'),
  ('adult-3m',9999,true,interval '3 months'),
  ('junior-1m',4,false,interval '5 weeks'),
  ('junior-6m-24',24,false,interval '6 months'),
  ('junior-6m-50',50,false,interval '6 months');

-- Existing aggregate balances cannot be reverse-engineered into purchases.
-- Preserve them exactly once as explicitly labelled, non-expiring legacy
-- batches; never re-credit historical purchase receipts as new purchases.
lock table public.credit_accounts in share row exclusive mode;
insert into public.credit_batches(user_id, credits_total, credits_remaining, expires_at, source)
select user_id, credits, credits, 'infinity'::timestamptz, 'legacy'
from public.credit_accounts where credits > 0;
insert into public.credit_batches(user_id, credits_total, credits_remaining, expires_at, unlimited, source)
select user_id, 0, 0, 'infinity'::timestamptz, true, 'legacy'
from public.credit_accounts where unlimited;

-- Caller must hold the account row lock. Expired credits are excluded, rather
-- than destroyed, so their original purchase and refund history is retained.
create function credit_private.sync_account(owner_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.credit_accounts a set
    credits = (select coalesce(sum(b.credits_remaining),0)::integer
      from public.credit_batches b where b.user_id = owner_id and not b.unlimited and b.expires_at > now()),
    unlimited = exists(select 1 from public.credit_batches b
      where b.user_id = owner_id and b.unlimited and b.expires_at > now())
  where a.user_id = owner_id;
$$;
revoke all on function credit_private.sync_account(uuid) from public, anon, authenticated;

create function credit_private.summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  account public.credit_accounts%rowtype;
  soonest jsonb;
begin
  if caller is null or not exists (select 1 from public.users where id = caller and role = 'student') then
    raise exception 'Student authentication required.';
  end if;
  select * into account from public.credit_accounts where user_id = caller for update;
  if not found then return jsonb_build_object('credits',0,'unlimited',false,'active',false,'expiring',null); end if;
  perform credit_private.sync_account(caller);
  select * into account from public.credit_accounts where user_id = caller;
  -- Aggregate identical earliest expirations so the warning does not undercount.
  select jsonb_build_object('credits',sum(credits_remaining)::integer,'expiresAt',expires_at)
  into soonest from public.credit_batches
  where user_id = caller and not unlimited and credits_remaining > 0
    and expires_at > now() and expires_at <= now() + interval '21 days'
  group by expires_at order by expires_at limit 1;
  return jsonb_build_object('credits',case when account.active then account.credits else 0 end,
    'unlimited',account.active and account.unlimited,'active',account.active,
    'expiring',case when account.active then soonest else null end);
end; $$;
revoke all on function credit_private.summary() from public, anon, authenticated;
grant execute on function credit_private.summary() to authenticated;
create function public.my_credit_summary()
returns jsonb language sql security invoker set search_path = '' as $$ select credit_private.summary(); $$;
revoke all on function public.my_credit_summary() from public, anon, authenticated;
grant execute on function public.my_credit_summary() to authenticated;

-- Optional scheduler entry point: useful for reporting caches even while users
-- are offline. Correctness does NOT depend on cron: reads/writes also reconcile.
create function credit_private.reconcile_accounts()
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  for owner_id in select user_id from public.credit_accounts order by user_id for update loop
    perform credit_private.sync_account(owner_id);
  end loop;
end; $$;
revoke all on function credit_private.reconcile_accounts() from public, anon, authenticated;
grant usage on schema credit_private to service_role;
grant execute on function credit_private.reconcile_accounts() to service_role;

-- Keep backward compatibility with the nine-argument webhook call, while the
-- updated webhook supplies the signed Stripe event time for stable validity.
drop function public.finalize_credit_checkout(uuid,text,text,text,integer,boolean,text,integer,text);
create function public.finalize_credit_checkout(
  auth_user uuid, stripe_session text, pass_id text, pass_title text,
  credits integer, unlimited boolean, membership_type text,
  paid_amount integer, paid_currency text, purchased_at timestamptz default now()
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  plan credit_private.pass_validity%rowtype;
  receipt public.credit_purchases%rowtype;
  paid_time timestamptz := purchased_at;
  expiry timestamptz;
begin
  if auth_user is null or stripe_session is null or btrim(stripe_session) = ''
    or paid_amount is null or paid_amount <= 0 or lower(paid_currency) is distinct from 'sgd'
    or paid_time is null or not isfinite(paid_time) or paid_time > now() + interval '5 minutes'
    or membership_type is null or membership_type not in ('adult','junior','student','senior') then
    raise exception 'Invalid credit purchase.';
  end if;
  if not exists(select 1 from public.users where id = auth_user and role = 'student') then
    raise exception 'Unknown student account.';
  end if;
  select * into plan from credit_private.pass_validity p where p.pass_id = finalize_credit_checkout.pass_id;
  if not found or plan.credits is distinct from credits or plan.unlimited is distinct from unlimited then
    raise exception 'Unknown pass or credit amount mismatch.';
  end if;
  insert into public.credit_accounts(user_id,credits,unlimited,active,membership_type)
  values(auth_user,0,false,true,membership_type) on conflict(user_id) do nothing;
  perform user_id from public.credit_accounts where user_id = auth_user for update;
  select * into receipt from public.credit_purchases where stripe_session_id = stripe_session;
  if found then
    if receipt.user_id <> auth_user or receipt.pass_id <> pass_id
      or receipt.amount_cents <> paid_amount or receipt.currency <> lower(paid_currency) then
      raise exception 'Checkout identity mismatch.';
    end if;
    return; -- Includes pre-migration receipts: never grant credits twice.
  end if;
  expiry := ((paid_time at time zone 'Asia/Singapore') + plan.validity) at time zone 'Asia/Singapore';
  insert into public.credit_purchases(stripe_session_id,user_id,pass_id,pass_title,credits,unlimited,amount_cents,currency,created_at)
  values(stripe_session,auth_user,pass_id,pass_title,credits,unlimited,paid_amount,lower(paid_currency),paid_time);
  insert into public.credit_batches(user_id,credits_total,credits_remaining,expires_at,created_at,unlimited,stripe_session_id)
  values(auth_user,case when unlimited then 0 else credits end,case when unlimited then 0 else credits end,
    expiry,paid_time,unlimited,stripe_session);
  perform credit_private.sync_account(auth_user);
  update public.credit_accounts set active = true where user_id = auth_user;
  insert into public.payments(student_id,item,description,amount_cents,currency,status,stripe_session_id,paid_at)
  select s.id,'Class pass',pass_title,paid_amount,lower(paid_currency),'paid',stripe_session,paid_time
  from public.students s where s.user_id = auth_user on conflict(stripe_session_id) do nothing;
end; $$;
revoke all on function public.finalize_credit_checkout(uuid,text,text,text,integer,boolean,text,integer,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_credit_checkout(uuid,text,text,text,integer,boolean,text,integer,text,timestamptz)
  to service_role;
-- This service-only invoker needs access to the private catalogue and sync helper.
grant select on credit_private.pass_validity to service_role;
grant execute on function credit_private.sync_account(uuid) to service_role;
grant select on public.users, public.students to service_role;

-- Preserve all existing capacity, overlap, membership, attendance and waitlist
-- rules. Revoke direct access to the old implementation to prevent bypasses.
alter function student_calendar_private.change_booking(text,uuid,uuid) rename to change_booking_core;
revoke all on function student_calendar_private.change_booking_core(text,uuid,uuid)
  from public, anon, authenticated;
create function student_calendar_private.change_booking(action text,target_id uuid,original_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  member_id uuid;
  account public.credit_accounts%rowtype;
  allocation credit_private.booking_allocations%rowtype;
  batch public.credit_batches%rowtype;
  response jsonb;
begin
  if caller is null or (select public.current_user_role()) is distinct from 'student'::public.user_role then
    raise exception 'Sign in as a student to manage class bookings.';
  end if;
  select id into member_id from public.students where user_id = caller for update;
  if not found then raise exception 'Your account is not linked to a student membership.'; end if;
  select * into account from public.credit_accounts where user_id = caller for update;
  -- Core changes and credit writes share ONE transaction: any failure rolls back
  -- the seat as well as all batch/account/audit writes.
  response := student_calendar_private.change_booking_core(action,target_id,original_id);

  if action = 'enrol' then
    if account.user_id is null or not account.active then raise exception 'An active credit account is required.'; end if;
    -- Active unlimited passes take precedence without consuming finite credits.
    select * into batch from public.credit_batches where user_id = caller
      and expires_at > now() and unlimited order by expires_at,created_at,id limit 1 for update;
    if not found then
      -- FEFO (earliest expiry first), with deterministic FIFO tie-breaks.
      select * into batch from public.credit_batches where user_id = caller
        and expires_at > now() and not unlimited and credits_remaining > 0
        order by expires_at,created_at,id limit 1 for update;
      if not found then raise exception 'No unexpired credits available. Please top up.'; end if;
      update public.credit_batches set credits_remaining = credits_remaining - 1 where id = batch.id;
      insert into public.credit_batch_transactions(user_id,batch_id,event_id,delta)
      values(caller,batch.id,target_id,-1);
    end if;
    insert into credit_private.booking_allocations(event_id,student_id,batch_id,charged)
    values(target_id,member_id,batch.id,not batch.unlimited);
  elsif action = 'cancel' then
    select * into allocation from credit_private.booking_allocations
      where event_id = target_id and student_id = member_id for update;
    if found then
      if allocation.charged then
        -- Refund to the ORIGINAL batch without extending its expiration.
        update public.credit_batches set credits_remaining = credits_remaining + 1 where id = allocation.batch_id;
        insert into public.credit_batch_transactions(user_id,batch_id,event_id,delta)
        values(caller,allocation.batch_id,target_id,1);
      end if;
      delete from credit_private.booking_allocations where event_id = target_id and student_id = member_id;
    end if; -- Historical uncharged bookings never mint refund credits.
  elsif action = 'reschedule' then
    -- Move the prepaid allocation, never charge again or manufacture a refund.
    update credit_private.booking_allocations set event_id = target_id
    where event_id = original_id and student_id = member_id;
  end if;
  if account.user_id is not null then perform credit_private.sync_account(caller); end if;
  return response;
end; $$;
revoke all on function student_calendar_private.change_booking(text,uuid,uuid) from public, anon, authenticated;
grant execute on function student_calendar_private.change_booking(text,uuid,uuid) to authenticated;

-- SQL function bodies resolve their target again after the rename.
create or replace function public.change_student_class_booking(action text,target_id uuid,original_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select student_calendar_private.change_booking(action,target_id,original_id);
$$;

notify pgrst, 'reload schema';
commit;
