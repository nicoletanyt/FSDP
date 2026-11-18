-- Payment history for a student, readable by administrators and by instructors
-- (who can read every student). Merges the same three sources the student sees on
-- their own payments page, without widening RLS on those tables.
create function public.student_payment_history(target_student uuid)
returns table (
  id text,
  paid_at timestamptz,
  item text,
  description text,
  method text,
  amount_cents integer,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if not (public.current_user_role() in ('administrator'::public.user_role, 'instructor'::public.user_role)) then
    raise exception 'Not allowed to view this student''s payments' using errcode = '42501';
  end if;

  select s.user_id into owner from public.students s where s.id = target_student;

  return query
  select * from (
    select p.id::text, coalesce(p.paid_at, p.created_at), p.item, p.description, p.method,
           p.amount_cents, p.status::text
    from public.payments p
    where p.student_id = target_student and p.currency = 'sgd'
    union all
    select 'credit:' || c.stripe_session_id, c.created_at, 'Class pass', c.pass_title, 'Stripe',
           c.amount_cents, 'paid'
    from public.credit_purchases c
    where owner is not null and c.user_id = owner and c.currency = 'sgd'
      and not exists (select 1 from public.payments p
                      where p.student_id = target_student and p.stripe_session_id = c.stripe_session_id)
    union all
    select 'grading:' || a.id::text, a.created_at, 'Grading',
           'Grading fee' || coalesce(' — ' || g.label, ''), 'Stripe',
           coalesce(a.amount_cents, 6000), 'paid'
    from public.grading_checkout_attempts a
    left join public.grades g on g.id = a.target_grade_id
    where a.student_id = target_student and a.status = 'paid'
  ) h
  order by 2 desc;
end;
$$;

revoke all on function public.student_payment_history(uuid) from public, anon;
grant execute on function public.student_payment_history(uuid) to authenticated;
