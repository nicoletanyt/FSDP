-- EmailJS does not support an idempotency key. Reserve each automatic message
-- before contacting the provider, so Stripe retries cannot send duplicates.
create table public.student_email_sends (
  send_key text primary key check (length(send_key) between 1 and 255),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'failed', 'legacy')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.student_email_sends enable row level security;
revoke all on public.student_email_sends from public, anon, authenticated;
grant select, insert, update on public.student_email_sends to service_role;

-- Payments completed before the EmailJS switch may have been emailed through
-- Resend. Do not send them again if Stripe redelivers an old event. "legacy"
-- deliberately makes no claim about whether the old provider delivered it.
insert into public.student_email_sends (send_key, status, completed_at)
select distinct 'membership-paid/' || s.id || '/' || s.member_no || '/v1', 'legacy', now()
from public.students s
join public.payments p on p.student_id = s.id
where p.item = 'Membership' and p.status = 'paid';

insert into public.student_email_sends (send_key, status, completed_at)
select 'credit-receipt/' || stripe_session_id || '/v1', 'legacy', now()
from public.credit_purchases;
