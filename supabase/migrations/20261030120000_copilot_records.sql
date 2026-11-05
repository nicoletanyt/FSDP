-- The existing instructor screens use fixtures. These tables hold real records only;
-- no demo students, attendance, membership or grading requirements are seeded.
create table public.student_records (
  student_id uuid primary key references public.users(id) on delete cascade,
  current_grade text check (char_length(current_grade) <= 80),
  target_grade text check (char_length(target_grade) <= 80),
  membership_status text check (membership_status in ('active', 'expired', 'suspended', 'pending')),
  membership_expires_on date
);

create table public.instructor_students (
  instructor_id uuid references public.users(id) on delete cascade,
  student_id uuid references public.student_records(student_id) on delete cascade,
  primary key (instructor_id, student_id)
);

create table public.student_attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_records(student_id) on delete cascade,
  session_at timestamptz not null,
  status text not null check (status in ('present', 'absent', 'unmarked')),
  unique (student_id, session_at)
);

create table public.student_training_progress (
  student_id uuid primary key references public.student_records(student_id) on delete cascade,
  -- Counts and requirements must refer to the current grading cycle. Unknown is null.
  training_sessions integer check (training_sessions >= 0),
  required_sessions integer check (required_sessions > 0),
  technique_checks integer check (technique_checks >= 0),
  required_technique_checks integer check (required_technique_checks > 0),
  kata_complete boolean,
  updated_at timestamptz not null default now()
);

create index on public.student_attendance (student_id, session_at desc);

alter table public.student_records enable row level security;

alter table public.instructor_students enable row level security;

alter table public.student_attendance enable row level security;

alter table public.student_training_progress enable row level security;

-- Read through the narrow RPC below. Provisioning/imports use trusted server tooling.
revoke all on public.student_records, public.instructor_students,
  public.student_attendance, public.student_training_progress from public, anon, authenticated;

grant select, insert, update, delete on public.student_records, public.instructor_students,
  public.student_attendance, public.student_training_progress to service_role;

create function public.get_instructor_student_records()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(record order by record->>'name', record->>'studentId'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'studentId', s.student_id,
      'name', trim(u.first_name || ' ' || u.last_name),
      'currentGrade', s.current_grade,
      'targetGrade', s.target_grade,
      'membershipStatus', s.membership_status,
      'membershipExpiresOn', s.membership_expires_on,
      'attendance', coalesce(a.history, '[]'::jsonb),
      'progress', case when p.student_id is null then null else jsonb_build_object(
        'trainingSessions', p.training_sessions, 'requiredSessions', p.required_sessions,
        'techniqueChecks', p.technique_checks, 'requiredTechniqueChecks', p.required_technique_checks,
        'kataComplete', p.kata_complete, 'updatedAt', p.updated_at
      ) end
    ) as record
    from public.instructor_students i
    join public.student_records s on s.student_id = i.student_id
    join public.users u on u.id = s.student_id and u.role = 'student'
    left join public.student_training_progress p on p.student_id = s.student_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('sessionAt', h.session_at, 'status', h.status)
        order by h.session_at desc) as history
      from (
        select session_at, status from public.student_attendance
        where student_id = s.student_id and session_at <= now()
        order by session_at desc limit 100
      ) h
    ) a on true
    where i.instructor_id = (select auth.uid())
      and (select public.current_user_role()) = 'instructor'
  ) scoped;
$$;

revoke all on function public.get_instructor_student_records() from public, anon;

grant execute on function public.get_instructor_student_records() to authenticated;

-- Shared, atomic per-account limit across Edge Function instances.
create table public.copilot_rate_limits (
  user_id uuid primary key references public.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);

alter table public.copilot_rate_limits enable row level security;

revoke all on public.copilot_rate_limits from public, anon, authenticated;

create function public.consume_copilot_request()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare used integer;
begin
  if (select public.current_user_role()) is distinct from 'instructor'::public.user_role then
    return false;
  end if;
  insert into public.copilot_rate_limits as limits (user_id, window_start, requests)
  values (auth.uid(), date_trunc('minute', clock_timestamp()), 1)
  on conflict (user_id) do update set
    requests = case when limits.window_start = excluded.window_start then limits.requests + 1 else 1 end,
    window_start = excluded.window_start
  returning requests into used;
  return used <= 10;
end;
$$;

revoke all on function public.consume_copilot_request() from public, anon;

grant execute on function public.consume_copilot_request() to authenticated;
