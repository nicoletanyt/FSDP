begin;

-- Preview requests persist separately; they are not eligible, submitted applications.
create table public.grading_application_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  request_id uuid not null,
  current_grade_id text not null references public.grades(id),
  target_grade_id text not null references public.grades(id),
  track public.grade_track not null,
  base_fee_cents integer not null check (base_fee_cents > 0),
  currency text not null default 'sgd' check (currency = 'sgd'),
  status text not null default 'draft' check (status in ('draft', 'checkout_open', 'preview_paid')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id),
  check (status = 'draft' or stripe_session_id is not null)
);
create index grading_application_drafts_student_idx on public.grading_application_drafts(student_id);
create index grading_application_drafts_user_created_idx on public.grading_application_drafts(user_id, created_at desc);
create index grading_application_drafts_current_grade_idx on public.grading_application_drafts(current_grade_id);
create index grading_application_drafts_target_grade_idx on public.grading_application_drafts(target_grade_id);

alter table public.grading_application_drafts enable row level security;
revoke all on public.grading_application_drafts from anon, authenticated;
grant select on public.grading_application_drafts to authenticated;
grant select, insert, update on public.grading_application_drafts to service_role;
create policy "Students read own grading drafts" on public.grading_application_drafts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Administrators read grading drafts" on public.grading_application_drafts
  for select to authenticated using ((select public.is_administrator()));

notify pgrst, 'reload schema';
commit;
