begin;

-- An administrator leaving a grading open permits late applications for eligible
-- students. The exam/date/status/readiness guards still apply.
create or replace function public.eligible_grading_students(target_event uuid)
returns table(student_id uuid, user_id uuid, email text, target_grade_id text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.email, ready.target_grade_id
  from public.gradings gr
  join public.events e on e.id = gr.event_id
  join public.students s on s.membership_status = 'active' and not s.outstanding_fees
    and (s.home_centre_id = e.centre_id or gr.official_schedule) and s.user_id is not null
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
revoke all on function public.eligible_grading_students(uuid) from public, anon, authenticated;
grant execute on function public.eligible_grading_students(uuid) to service_role;

-- Some installations already have authoritative per-grade fees. Fill only
-- missing values; never overwrite a fee configured by an administrator.
alter table public.grade_requirements add column if not exists fee_cents integer;
update public.grade_requirements r set fee_cents = f.cents
from (values
  ('12-kyu',4500),('11-kyu',4500),('10-kyu',4500),('9-kyu',4500),('8-kyu',4500),('7-kyu',4500),
  ('6-kyu',5000),('6-kyu-silver',5000),('5-kyu',5500),('4-kyu',6000),('4-kyu-silver',6000),
  ('3-kyu',6500),('2-kyu',9000),('2-kyu-silver',9000),('1-kyu',9500),('junior-dan',21500),
  ('1-dan',53500),('2-dan',59000),('3-dan',69500),('4-dan',91000)
) f(grade_id,cents) where r.grade_id=f.grade_id and r.fee_cents is null;

alter table public.grading_checkout_attempts add column if not exists amount_cents integer;
alter table public.grading_checkout_attempts add column if not exists base_fee_cents integer;
alter table public.grading_checkout_attempts add column if not exists late_fee_cents integer;

-- Keep previously created Stripe sessions payable at their original price.
update public.grading_checkout_attempts
set base_fee_cents = amount_cents, late_fee_cents = 0
where amount_cents is not null and base_fee_cents is null;

drop function public.reserve_grading_checkout(uuid, uuid);
create function public.reserve_grading_checkout(target_event uuid, auth_user uuid)
returns table(attempt_id uuid, checkout_session text, target_grade text, revision integer,
  amount integer, base_amount integer, late_amount integer, deadline date)
language plpgsql security definer set search_path = '' as $$
declare
  eligible record;
  fee integer;
  late_charge integer;
  closing_date date;
  attempt_row public.grading_checkout_attempts%rowtype;
begin
  select eg.* into eligible from public.eligible_grading_students(target_event) eg where eg.user_id=auth_user;
  if not found then raise exception 'Grading is unavailable or student is ineligible'; end if;
  select r.fee_cents, gr.application_deadline into fee, closing_date
  from public.gradings gr join public.grade_requirements r
    on r.grade_id=eligible.target_grade_id and r.track=gr.track where gr.event_id=target_event;
  if fee is null or fee <= 0 then raise exception 'Grading fee is not configured'; end if;
  late_charge := case when (now() at time zone 'Asia/Singapore')::date > closing_date then 2200 else 0 end;

  insert into public.grading_checkout_attempts(student_id,grading_event_id,target_grade_id,amount_cents,base_fee_cents,late_fee_cents)
  values (eligible.student_id,target_event,eligible.target_grade_id,fee+late_charge,fee,late_charge)
  on conflict(student_id,grading_event_id) do nothing;
  select * into attempt_row from public.grading_checkout_attempts a
    where a.student_id=eligible.student_id and a.grading_event_id=target_event for update;
  -- Requote across midnight only before a Stripe session is issued. Issued
  -- sessions keep a fixed amount; an expired session must be retired first.
  if attempt_row.stripe_session_id is null and attempt_row.status='pending' then
    update public.grading_checkout_attempts a
      set amount_cents=fee+late_charge, base_fee_cents=fee, late_fee_cents=late_charge,
        target_grade_id=eligible.target_grade_id
      where a.id=attempt_row.id returning * into attempt_row;
  end if;
  return query select attempt_row.id,attempt_row.stripe_session_id,attempt_row.target_grade_id,
    attempt_row.checkout_revision,attempt_row.amount_cents,attempt_row.base_fee_cents,
    attempt_row.late_fee_cents,closing_date;
end; $$;
revoke all on function public.reserve_grading_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_grading_checkout(uuid,uuid) to service_role;

-- One caller-scoped source for the form's eligibility, deadlines and fee totals.
create function public.my_grading_checkout_options()
returns table(id uuid, name text, grading_date date, application_deadline date,
  centre_name text, venue_address text, target_grade text, grade_label text,
  applied boolean, base_amount integer, late_amount integer, total_amount integer)
language sql stable security definer set search_path = '' as $$
  select o.id,o.name,o.grading_date,o.application_deadline,o.centre_name,o.venue_address,
    o.target_grade,grade.label,o.applied,price.base,price.late,price.base+price.late
  from public.my_grading_opportunities() o
  join public.gradings g on g.event_id=o.id
  join public.grades grade on grade.id=o.target_grade
  join public.grade_requirements r on r.grade_id=o.target_grade and r.track=g.track
  left join public.grading_checkout_attempts a on a.grading_event_id=o.id
    and a.student_id=public.current_student_id()
  cross join lateral (select
    case when a.stripe_session_id is not null then coalesce(a.base_fee_cents,a.amount_cents)
      else r.fee_cents end as base,
    case when a.stripe_session_id is not null then coalesce(a.late_fee_cents,0)
      when (now() at time zone 'Asia/Singapore')::date > o.application_deadline then 2200 else 0 end as late
  ) price;
$$;
revoke all on function public.my_grading_checkout_options() from public,anon;
grant execute on function public.my_grading_checkout_options() to authenticated;

-- Only the verified Stripe webhook can submit an application and record payment.
create or replace function public.finalize_grading_checkout(attempt uuid, stripe_session text, paid_amount integer, paid_currency text)
returns void language plpgsql security definer set search_path = '' as $$
declare record_ public.grading_checkout_attempts%rowtype;
begin
  select * into record_ from public.grading_checkout_attempts where id=attempt for update;
  if not found or record_.stripe_session_id is distinct from stripe_session
    or stripe_session is null or record_.amount_cents is null
    or paid_amount is distinct from record_.amount_cents
    or paid_currency is null or lower(paid_currency) <> 'sgd' then
    raise exception 'Payment does not match grading attempt';
  end if;
  if record_.status='paid' then return; end if;
  insert into public.grading_applications(student_id,grading_event_id,target_grade_id)
  values(record_.student_id,record_.grading_event_id,record_.target_grade_id)
  on conflict(student_id,grading_event_id) do nothing;
  insert into public.payments(student_id,item,description,amount_cents,currency,status,stripe_session_id,paid_at)
  values(record_.student_id,'Grading','Grading examination — '||record_.target_grade_id,
    paid_amount,'sgd','paid',stripe_session,now())
  on conflict(stripe_session_id) do nothing;
  update public.grading_checkout_attempts set status='paid' where id=attempt;
end; $$;
revoke all on function public.finalize_grading_checkout(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.finalize_grading_checkout(uuid,text,integer,text) to service_role;

-- Retire the legacy demo-only browser write endpoint if an installation has it.
do $$ begin
  if to_regprocedure('public.record_grading_payment(uuid,text)') is not null then
    revoke execute on function public.record_grading_payment(uuid,text) from public,anon,authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
