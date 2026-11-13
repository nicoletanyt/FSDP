-- One attendance notice per student per Singapore calendar week. Pending sends
-- remain reserved if provider delivery is uncertain; failed sends can be retried.
create table public.admin_attendance_email_sends (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  requested_by uuid not null references public.users(id),
  week_start date not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);
create unique index attendance_email_one_per_student_week
  on public.admin_attendance_email_sends(student_id, week_start)
  where status in ('pending', 'accepted');
create index attendance_email_recent_idx on public.admin_attendance_email_sends(created_at desc);
alter table public.admin_attendance_email_sends enable row level security;
create policy "Administrators read attendance sends" on public.admin_attendance_email_sends
  for select to authenticated using (public.is_administrator());
revoke all on public.admin_attendance_email_sends from public, anon, authenticated;
grant select on public.admin_attendance_email_sends to authenticated;
