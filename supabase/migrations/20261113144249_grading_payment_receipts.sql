begin;

alter table public.grading_application_drafts
  drop constraint grading_application_drafts_status_check,
  add constraint grading_application_drafts_status_check
    check (status in ('draft', 'checkout_open', 'preview_paid', 'pending_review')),
  add column review_requested_at timestamptz,
  add column payment_confirmed_at timestamptz;

-- Keep test receipts separate from real-money payments and formal event applications.
create table public.grading_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.grading_application_drafts(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  target_grade_id text not null references public.grades(id),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'sgd'),
  payment_status text not null default 'paid' check (payment_status = 'paid'),
  livemode boolean not null default false check (not livemode),
  verified_at timestamptz not null default now()
);
create index grading_payment_receipts_user_idx on public.grading_payment_receipts(user_id);
create index grading_payment_receipts_student_idx on public.grading_payment_receipts(student_id);
create index grading_payment_receipts_grade_idx on public.grading_payment_receipts(target_grade_id);
alter table public.grading_payment_receipts enable row level security;
revoke all on public.grading_payment_receipts from anon, authenticated;
grant select on public.grading_payment_receipts to authenticated;
grant select, insert on public.grading_payment_receipts to service_role;
create policy "Students read own grading payment receipts" on public.grading_payment_receipts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Administrators read grading payment receipts" on public.grading_payment_receipts
  for select to authenticated using ((select public.is_administrator()));

-- Service-only and transactional: a confirmed state always has a matching receipt.
create function public.finalize_grading_preview_payment(
  draft uuid, owner_user uuid, stripe_session text, paid_amount integer,
  paid_currency text, target_grade text, stripe_live boolean, payment_intent text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  saved public.grading_application_drafts%rowtype;
  receipt_id uuid;
begin
  select * into saved from public.grading_application_drafts where id = draft for update;
  if not found or saved.user_id is distinct from owner_user
    or saved.stripe_session_id is distinct from stripe_session or stripe_session is null
    or saved.target_grade_id is distinct from target_grade
    or saved.base_fee_cents is distinct from paid_amount
    or paid_currency is distinct from 'sgd' or stripe_live is distinct from false
    or not exists (select 1 from public.students s where s.id=saved.student_id and s.user_id=owner_user)
  then raise exception 'Verified payment does not match the grading request'; end if;

  insert into public.grading_payment_receipts(draft_id,user_id,student_id,target_grade_id,
    stripe_session_id,stripe_payment_intent_id,amount_cents,currency,livemode)
  values(saved.id,saved.user_id,saved.student_id,saved.target_grade_id,
    stripe_session,payment_intent,paid_amount,paid_currency,false)
  on conflict(stripe_session_id) do nothing;
  select r.id into receipt_id from public.grading_payment_receipts r
    where r.stripe_session_id=stripe_session and r.draft_id=saved.id
      and r.user_id=owner_user and r.amount_cents=paid_amount and r.currency=paid_currency;
  if receipt_id is null then raise exception 'Payment receipt conflict'; end if;

  update public.grading_application_drafts set status='pending_review',
    review_requested_at=coalesce(review_requested_at,now()),
    payment_confirmed_at=coalesce(payment_confirmed_at,now()), updated_at=now()
    where id=saved.id;
  return receipt_id;
end; $$;
revoke all on function public.finalize_grading_preview_payment(uuid,uuid,text,integer,text,text,boolean,text)
  from public,anon,authenticated;
grant execute on function public.finalize_grading_preview_payment(uuid,uuid,text,integer,text,text,boolean,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
