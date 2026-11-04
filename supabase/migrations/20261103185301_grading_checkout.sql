-- Authoritative eligibility is recalculated at invitation, checkout, and finalization.
-- Only service_role can query this function; students cannot nominate their own target grade.
create function public.eligible_grading_students(target_event uuid)
returns table(student_id uuid, user_id uuid, email text, target_grade_id text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.email, next_grade.id
  from public.gradings gr
  join public.events e on e.id = gr.event_id
  join public.students s on s.membership_status = 'active' and not s.outstanding_fees
    and s.home_centre_id = e.centre_id and s.user_id is not null
  join public.grades current_grade on current_grade.id = s.current_grade_id
  join lateral (
    select grade.id from public.grades grade
    join public.grade_tracks gt on gt.grade_id = grade.id and gt.track = gr.track
    where grade.sort_order > current_grade.sort_order
    order by grade.sort_order limit 1
  ) next_grade on true
  join public.grading_target_grades tgt on tgt.grading_event_id = e.id and tgt.grade_id = next_grade.id
  join public.grade_requirements req on req.grade_id = next_grade.id and req.track = gr.track
  where gr.event_id = target_event and gr.application_status = 'open'
    and (case when extract(year from now() at time zone 'Asia/Singapore') - extract(year from s.date_of_birth) >= 13
      then gr.track = 'adult' else gr.track = 'children' end)
    and e.status = 'scheduled' and e.starts_at > now()
    and gr.application_deadline >= (now() at time zone 'Asia/Singapore')::date
    and s.joined_at <= (now() at time zone 'Asia/Singapore')::date - interval '3 months'
    and (req.min_age_years is null or extract(year from now() at time zone 'Asia/Singapore') - extract(year from s.date_of_birth) >= req.min_age_years)
    and (req.min_months = 0 or s.last_graded_at <= (now() at time zone 'Asia/Singapore')::date - make_interval(months => req.min_months))
    and (req.min_sessions is null or (select count(*) from public.event_students es
      join public.events ce on ce.id = es.event_id
      where es.student_id = s.id and ce.event_type = 'class'
        and ce.starts_at::date >= coalesce(s.last_graded_at, s.joined_at)
        and es.attendance_status in ('present', 'late')) >= req.min_sessions)
    and not exists (select 1 from public.syllabus_items si
      where si.grade_id = next_grade.id and si.track = gr.track
      and not exists (select 1 from public.technique_sign_offs tso
        where tso.student_id = s.id and tso.syllabus_item_id = si.id))
    and not exists (select 1 from public.grading_applications a where a.student_id = s.id and a.grading_event_id = e.id);
$$;
revoke all on function public.eligible_grading_students(uuid) from public, anon, authenticated;
grant execute on function public.eligible_grading_students(uuid) to service_role;

create function public.my_grading_opportunities()
returns table(id uuid, name text, starts_at timestamptz, application_deadline date, centre_name text, target_grade text, applied boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.starts_at, g.application_deadline, c.name,
    coalesce(eligible.target_grade_id, a.target_grade_id), a.id is not null
  from public.students s
  join public.events e on e.centre_id = s.home_centre_id and e.event_type = 'grading'
  join public.gradings g on g.event_id = e.id
  join public.centres c on c.id = e.centre_id
  left join lateral (select eg.target_grade_id from public.eligible_grading_students(e.id) eg where eg.student_id = s.id) eligible on true
  left join public.grading_applications a on a.student_id = s.id and a.grading_event_id = e.id
  where s.user_id = (select auth.uid()) and (eligible.target_grade_id is not null or a.id is not null)
    and e.starts_at > now()
  order by e.starts_at;
$$;
revoke all on function public.my_grading_opportunities() from public, anon;
grant execute on function public.my_grading_opportunities() to authenticated;

create table public.grading_email_sends (
  id uuid primary key default gen_random_uuid(),
  grading_event_id uuid not null references public.gradings(event_id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'failed')),
  recipient_count integer not null check (recipient_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);
create unique index grading_email_one_accepted_or_pending on public.grading_email_sends(grading_event_id)
where status in ('pending', 'accepted');
alter table public.grading_email_sends enable row level security;
create policy "Admins read grading sends" on public.grading_email_sends
for select to authenticated using (public.is_administrator());

create table public.grading_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  grading_event_id uuid not null references public.gradings(event_id),
  target_grade_id text not null references public.grades(id),
  stripe_session_id text unique,
  checkout_revision integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  unique(student_id, grading_event_id)
);
alter table public.grading_checkout_attempts enable row level security;
create policy "Students read own checkout attempts" on public.grading_checkout_attempts
for select to authenticated using (student_id = public.current_student_id());

create function public.reserve_grading_checkout(target_event uuid, auth_user uuid)
returns table(attempt_id uuid, checkout_session text, target_grade text, revision integer)
language plpgsql security definer set search_path = '' as $$
declare eligible record;
begin
  select eg.* into eligible from public.eligible_grading_students(target_event) eg where eg.user_id = auth_user;
  if not found then raise exception 'Grading is unavailable or student is ineligible'; end if;
  insert into public.grading_checkout_attempts(student_id, grading_event_id, target_grade_id)
  values (eligible.student_id, target_event, eligible.target_grade_id)
  on conflict(student_id, grading_event_id) do nothing;
  return query select a.id, a.stripe_session_id, a.target_grade_id, a.checkout_revision
    from public.grading_checkout_attempts a where a.student_id = eligible.student_id and a.grading_event_id = target_event;
end; $$;
revoke all on function public.reserve_grading_checkout(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_grading_checkout(uuid,uuid) to service_role;

-- The function caller must first verify the old Checkout session is expired
-- with Stripe. Compare-and-swap prevents concurrent retry requests from racing.
create function public.retry_grading_checkout(attempt uuid, expired_session text)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_revision integer;
begin
  update public.grading_checkout_attempts
    set stripe_session_id = null, checkout_revision = checkout_revision + 1
    where id = attempt and stripe_session_id = expired_session and status = 'pending'
    returning checkout_revision into next_revision;
  if next_revision is null then raise exception 'Checkout changed; refresh and retry'; end if;
  return next_revision;
end; $$;
revoke all on function public.retry_grading_checkout(uuid,text) from public, anon, authenticated;
grant execute on function public.retry_grading_checkout(uuid,text) to service_role;

create function public.finalize_grading_checkout(attempt uuid, stripe_session text, paid_amount integer, paid_currency text)
returns void language plpgsql security definer set search_path = '' as $$
declare record_ public.grading_checkout_attempts%rowtype;
begin
  select * into record_ from public.grading_checkout_attempts where id = attempt for update;
  if not found or record_.stripe_session_id is distinct from stripe_session or paid_amount <> 6000 or lower(paid_currency) <> 'sgd' then
    raise exception 'Payment does not match grading attempt';
  end if;
  if record_.status = 'paid' then return; end if;
  insert into public.grading_applications(student_id, grading_event_id, target_grade_id)
    values (record_.student_id, record_.grading_event_id, record_.target_grade_id)
    on conflict(student_id, grading_event_id) do nothing;
  update public.grading_checkout_attempts set status = 'paid' where id = attempt;
end; $$;
revoke all on function public.finalize_grading_checkout(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.finalize_grading_checkout(uuid,text,integer,text) to service_role;
