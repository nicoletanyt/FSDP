begin;

-- Preserve the existing enum and staff workflows: under_review is the formal
-- application's equivalent of pending_review. Test previews remain separate.
alter table public.grading_applications
  add column grading_date date,
  add column amount_paid_cents integer check (amount_paid_cents > 0),
  add column stripe_session_id text unique,
  add column payment_confirmed_at timestamptz;
alter table public.grading_checkout_attempts add column grading_date date;

update public.grading_checkout_attempts a set grading_date =
  coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date)
from public.gradings g join public.events e on e.id = g.event_id
where g.event_id = a.grading_event_id;
update public.grading_applications a set grading_date =
  coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date)
from public.gradings g join public.events e on e.id = g.event_id
where g.event_id = a.grading_event_id;
update public.grading_applications a set amount_paid_cents = c.amount_cents,
  stripe_session_id = c.stripe_session_id, payment_confirmed_at = coalesce(p.paid_at, a.submitted_at)
from public.grading_checkout_attempts c
left join public.payments p on p.stripe_session_id = c.stripe_session_id
where c.student_id = a.student_id and c.grading_event_id = a.grading_event_id
  and c.status = 'paid' and c.stripe_session_id is not null and c.amount_cents > 0;

-- Event uniqueness already exists. Date uniqueness also stops duplicate
-- applications through two different events scheduled on the same day.
create unique index grading_applications_student_date_idx
  on public.grading_applications(student_id, grading_date) where status <> 'withdrawn';
create unique index grading_checkout_attempts_student_date_idx
  on public.grading_checkout_attempts(student_id, grading_date);
alter table public.grading_applications add constraint grading_application_payment_complete
  check ((amount_paid_cents is null and stripe_session_id is null and payment_confirmed_at is null)
    or (amount_paid_cents is not null and stripe_session_id is not null
      and payment_confirmed_at is not null and grading_date is not null));

-- Snapshot the server's date, never a browser-supplied value. Once Stripe has
-- issued a session, rescheduling an event must not rewrite what was paid for.
create function public.snapshot_grading_checkout_date()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if old.stripe_session_id is not null or new.stripe_session_id is not null then
      new.grading_date := old.grading_date;
      return new;
    end if;
  end if;
  select coalesce(g.grading_date, (e.starts_at at time zone 'Asia/Singapore')::date)
    into new.grading_date from public.gradings g join public.events e on e.id = g.event_id
    where g.event_id = new.grading_event_id;
  if new.grading_date is null then raise exception 'A grading date is required'; end if;
  return new;
end $$;
revoke all on function public.snapshot_grading_checkout_date() from public, anon, authenticated;
create trigger snapshot_grading_checkout_date before insert or update
  on public.grading_checkout_attempts for each row execute function public.snapshot_grading_checkout_date();

-- Service-only transactional finalization, called only after Stripe verification.
create or replace function public.finalize_grading_checkout(
  attempt uuid, stripe_session text, paid_amount integer, paid_currency text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  saved public.grading_checkout_attempts%rowtype;
  application public.grading_applications%rowtype;
begin
  select * into saved from public.grading_checkout_attempts where id = attempt for update;
  if not found or stripe_session is null or saved.stripe_session_id is distinct from stripe_session
    or saved.amount_cents is null or paid_amount is distinct from saved.amount_cents
    or paid_currency is null or lower(paid_currency) <> 'sgd' or saved.grading_date is null then
    raise exception 'Payment does not match grading attempt';
  end if;
  if saved.status = 'paid' then return; end if;
  insert into public.grading_applications(student_id, grading_event_id, target_grade_id,
    grading_date, status, amount_paid_cents, stripe_session_id, payment_confirmed_at)
  values(saved.student_id, saved.grading_event_id, saved.target_grade_id,
    saved.grading_date, 'under_review', paid_amount, stripe_session, now())
  on conflict(student_id, grading_event_id) do nothing;
  select * into application from public.grading_applications
    where student_id = saved.student_id and grading_event_id = saved.grading_event_id for update;
  if application.stripe_session_id is distinct from stripe_session
    or application.amount_paid_cents is distinct from paid_amount
    or application.grading_date is distinct from saved.grading_date
    or application.target_grade_id is distinct from saved.target_grade_id then
    raise exception 'Existing application does not match this payment';
  end if;
  insert into public.payments(student_id, item, description, amount_cents, currency, status, stripe_session_id, paid_at)
  values(saved.student_id, 'Grading', 'Grading examination — ' || saved.target_grade_id,
    paid_amount, 'sgd', 'paid', stripe_session, now()) on conflict(stripe_session_id) do nothing;
  if not exists(select 1 from public.payments p where p.stripe_session_id = stripe_session
    and p.student_id = saved.student_id and p.amount_cents = paid_amount and p.currency = 'sgd' and p.status = 'paid') then
    raise exception 'Payment receipt conflict';
  end if;
  update public.grading_checkout_attempts set status = 'paid' where id = attempt;
end $$;
revoke all on function public.finalize_grading_checkout(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.finalize_grading_checkout(uuid,text,integer,text) to service_role;
grant select, insert, update on public.grading_applications, public.grading_checkout_attempts, public.payments to service_role;
grant select on public.gradings, public.events to service_role;

-- No student INSERT/UPDATE grants or policies are added to applications/payments.
create function public.my_grading_applications()
returns table(id uuid, grading_event_id uuid, target_grade_id text, grading_date date,
  status public.application_status, amount_paid_cents integer, payment_confirmed_at timestamptz,
  base_fee_cents integer, late_fee_cents integer)
language sql stable security definer set search_path = '' as $$
  select a.id, a.grading_event_id, a.target_grade_id, a.grading_date, a.status,
    a.amount_paid_cents, a.payment_confirmed_at, c.base_fee_cents, c.late_fee_cents
  from public.grading_applications a join public.students s on s.id = a.student_id
  left join public.grading_checkout_attempts c on c.student_id = a.student_id and c.grading_event_id = a.grading_event_id
  where s.user_id = (select auth.uid()) order by a.grading_date desc, a.submitted_at desc;
$$;
revoke all on function public.my_grading_applications() from public, anon;
grant execute on function public.my_grading_applications() to authenticated;

-- Uses the official schedule already seeded from ASK; no invented fallback dates.
-- Include future closed/not-yet-open dates for discovery, but checkout still
-- requires my_grading_checkout_options and the server-side eligibility guards.
create function public.my_official_grading_dates()
returns table(id uuid, name text, grading_date date)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, g.grading_date from public.students s
  join public.gradings g on g.official_schedule and g.track =
    case when extract(year from (now() at time zone 'Asia/Singapore')) - extract(year from s.date_of_birth) >= 13
      then 'adult'::public.grade_track else 'children'::public.grade_track end
  join public.events e on e.id = g.event_id and e.status = 'scheduled'
  where s.user_id = (select auth.uid()) and g.grading_date >= (now() at time zone 'Asia/Singapore')::date
  order by g.grading_date, e.id;
$$;
revoke all on function public.my_official_grading_dates() from public, anon;
grant execute on function public.my_official_grading_dates() to authenticated;

-- Self-reported details are editable; clinician/instructor-recorded alerts are
-- never overwritten or silently deactivated by a student.
alter table public.student_medical_alerts add column student_reported boolean not null default false;
create unique index student_medical_alerts_self_report_idx
  on public.student_medical_alerts(student_id) where student_reported;

create function public.my_grading_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('full_name', trim(s.first_name || ' ' || s.last_name),
    'phone', coalesce(s.phone, ''),
    'emergency_name', coalesce(c.name, ''), 'emergency_relationship', coalesce(c.relationship, ''),
    'emergency_phone', coalesce(c.phone, ''), 'medical_details', coalesce(m.description, ''),
    'recorded_medical_details', coalesce((select jsonb_agg(a.description order by a.recorded_at, a.id)
      from public.student_medical_alerts a where a.student_id = s.id and a.active and not a.student_reported), '[]'::jsonb))
  from public.students s
  left join public.emergency_contacts c on c.student_id = s.id and c.is_primary
  left join public.student_medical_alerts m on m.student_id = s.id and m.student_reported and m.active
  where s.user_id = (select auth.uid()) and (select public.current_user_role()) = 'student';
$$;
revoke all on function public.my_grading_profile() from public, anon;
grant execute on function public.my_grading_profile() to authenticated;

create function public.save_my_grading_profile(details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  member_id uuid;
  medical text;
begin
  if (select public.current_user_role()) is distinct from 'student' then
    raise exception 'Sign in as a student to update your profile.';
  end if;
  if details is null or jsonb_typeof(details) <> 'object'
    or exists(select 1 from jsonb_object_keys(details) k where k not in ('phone','emergency_contact','medical_details'))
    or not (details ? 'emergency_contact' and details ? 'medical_details')
    or jsonb_typeof(details -> 'medical_details') <> 'string' then
    raise exception 'Complete your contact and medical details.';
  end if;
  medical := trim(details ->> 'medical_details');
  if char_length(medical) > 1000 then raise exception 'Medical details must be 1,000 characters or fewer.'; end if;
  select id into member_id from public.students where user_id = (select auth.uid()) for update;
  if not found then raise exception 'Your account is not linked to a student record.'; end if;
  perform public.update_my_student_profile(details - 'medical_details');
  if medical = '' then
    update public.student_medical_alerts set active = false where student_id = member_id and student_reported;
  else
    insert into public.student_medical_alerts(student_id, description, active, student_reported)
    values(member_id, medical, true, true)
    on conflict(student_id) where student_reported do update
      set description = excluded.description, active = true, recorded_at = now();
  end if;
  return public.my_grading_profile();
end $$;
revoke all on function public.save_my_grading_profile(jsonb) from public, anon;
grant execute on function public.save_my_grading_profile(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
