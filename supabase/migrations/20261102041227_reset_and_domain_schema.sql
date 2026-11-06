-- Full reset of the public domain schema.
-- Keeps auth.users intact; rebuilds public.users and backfills the 11 accounts.

-- ---------------------------------------------------------------------------
-- 1. Teardown
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;
drop trigger if exists on_auth_user_role_updated on auth.users;

drop table if exists public.users cascade;
drop table if exists public.gpt_rate_limits cascade;
drop table if exists public.student_training_progress cascade;
drop table if exists public.student_attendance cascade;
drop table if exists public.instructor_students cascade;
drop table if exists public.student_records cascade;

drop function if exists public.get_instructor_student_records();
drop function if exists public.consume_gpt_request();
drop function if exists public.create_user_profile();
drop function if exists public.sync_user_email();
drop function if exists public.sync_user_role();
drop function if exists public.current_user_role();

-- ---------------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.centre_status as enum ('active', 'closed', 'under_renovation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active', 'expired', 'pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.follow_up_status as enum ('none', 'flagged', 'contacted', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.grade_track as enum ('children', 'adult');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_type as enum ('class', 'seminar', 'workshop', 'grading');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('scheduled', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.grading_window_status as enum ('draft', 'open', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.application_status as enum ('submitted', 'under_review', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.assessment_status as enum ('pending', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_template as enum ('grading_invitation', 'attendance_concern', 'general_reminder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_delivery_status as enum ('pending', 'sent', 'delivered', 'failed', 'bounced');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. Auth profiles
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  email text not null,
  role public.user_role not null default 'student',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = (select auth.uid());
$$;

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create policy "Users read their own profile; administrators read all profiles"
on public.users for select to authenticated
using (
  id = (select auth.uid())
  or (select public.current_user_role()) = 'administrator'::public.user_role
);

revoke all on public.users from public, anon, authenticated;
grant select on public.users to authenticated;
grant select, insert, update, delete on public.users to service_role;

create function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, first_name, last_name, email, role, created_at)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 100),
    left(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 100),
    coalesce(new.email, ''),
    case new.raw_app_meta_data ->> 'role'
      when 'administrator' then 'administrator'::public.user_role
      when 'instructor' then 'instructor'::public.user_role
      else 'student'::public.user_role
    end,
    coalesce(new.created_at, now())
  );
  return new;
end;
$$;

revoke all on function public.create_user_profile() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_user_profile();

create function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set email = coalesce(new.email, ''), updated_at = now()
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_user_email() from public, anon, authenticated;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sync_user_email();

create function public.sync_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set role = case new.raw_app_meta_data ->> 'role'
    when 'administrator' then 'administrator'::public.user_role
    when 'instructor' then 'instructor'::public.user_role
    else 'student'::public.user_role
  end,
  updated_at = now()
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_user_role() from public, anon, authenticated;

create trigger on_auth_user_role_updated
after update of raw_app_meta_data on auth.users
for each row
when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
execute function public.sync_user_role();

insert into public.users (id, first_name, last_name, email, role, created_at)
select
  id,
  left(trim(coalesce(raw_user_meta_data ->> 'first_name', '')), 100),
  left(trim(coalesce(raw_user_meta_data ->> 'last_name', '')), 100),
  coalesce(email, ''),
  case raw_app_meta_data ->> 'role'
    when 'administrator' then 'administrator'::public.user_role
    when 'instructor' then 'instructor'::public.user_role
    else 'student'::public.user_role
  end,
  coalesce(created_at, now())
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Reference
-- ---------------------------------------------------------------------------

create table public.grades (
  id text primary key,
  label text not null unique,
  colour text,
  is_ranked boolean not null default true,
  sort_order smallint not null unique
);

create table public.grade_tracks (
  grade_id text not null references public.grades(id) on delete cascade,
  track public.grade_track not null,
  primary key (grade_id, track)
);

-- Eligibility is measured against the student's ladder, so the same belt can
-- carry different time/session minimums on the children's and adult sheets.
create table public.grade_requirements (
  grade_id text not null references public.grades(id) on delete cascade,
  track public.grade_track not null,
  min_months smallint not null default 0 check (min_months >= 0),
  max_months smallint check (max_months is null or max_months >= min_months),
  min_sessions smallint check (min_sessions is null or min_sessions >= 0),
  min_age_years smallint check (min_age_years is null or min_age_years >= 0),
  primary key (grade_id, track)
);

create table public.syllabus_items (
  id text primary key,
  grade_id text not null references public.grades(id) on delete cascade,
  track public.grade_track not null,
  category text not null,
  sort_order smallint not null,
  label text not null,
  unique (grade_id, track, category, sort_order)
);

create table public.class_types (
  id text primary key,
  label text not null,
  description text not null default ''
);

-- ---------------------------------------------------------------------------
-- 5. People
-- ---------------------------------------------------------------------------

create table public.centres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null unique,
  address text not null default '',
  timezone text not null default 'Asia/Singapore',
  status public.centre_status not null default 'active',
  capacity smallint check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete set null,
  member_no text not null unique,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  home_centre_id uuid not null references public.centres(id) on delete restrict,
  date_of_birth date not null,
  current_grade_id text not null default 'unranked' references public.grades(id),
  membership_status public.membership_status not null default 'active',
  joined_at date not null,
  last_graded_at date,
  follow_up_status public.follow_up_status not null default 'none',
  outstanding_fees boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index students_home_centre_idx on public.students (home_centre_id);
create index students_current_grade_idx on public.students (current_grade_id);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  name text not null,
  relationship text not null,
  phone text not null,
  is_primary boolean not null default false
);

create unique index emergency_contacts_one_primary_idx
on public.emergency_contacts (student_id)
where is_primary;

create table public.student_medical_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  description text not null,
  active boolean not null default true,
  recorded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_type public.event_type not null,
  centre_id uuid not null references public.centres(id) on delete restrict,
  instructor_id uuid references public.instructors(id) on delete set null,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.event_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index events_centre_start_idx on public.events (centre_id, starts_at);
create index events_instructor_start_idx on public.events (instructor_id, starts_at);

create table public.classes (
  event_id uuid primary key references public.events(id) on delete cascade,
  class_type_id text not null references public.class_types(id) on delete restrict
);

create table public.seminars (
  event_id uuid primary key references public.events(id) on delete cascade,
  external_location text
);

create table public.workshops (
  event_id uuid primary key references public.events(id) on delete cascade,
  description text
);

create table public.gradings (
  event_id uuid primary key references public.events(id) on delete cascade,
  track public.grade_track,
  application_deadline date,
  application_status public.grading_window_status not null default 'draft'
);

create table public.grading_target_grades (
  grading_event_id uuid not null references public.gradings(event_id) on delete cascade,
  grade_id text not null references public.grades(id) on delete restrict,
  primary key (grading_event_id, grade_id)
);

create table public.event_students (
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_status public.attendance_status,
  recorded_at timestamptz,
  report text,
  report_author_id uuid references public.instructors(id) on delete set null,
  assessment_status public.assessment_status,
  assessment_notes text,
  checked_in_at timestamptz,
  primary key (event_id, student_id)
);

create index event_students_student_idx on public.event_students (student_id);

create function public.assert_event_subtype()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected public.event_type := tg_argv[0]::public.event_type;
begin
  if not exists (
    select 1 from public.events where id = new.event_id and event_type = expected
  ) then
    raise exception 'Event % is not a % event', new.event_id, expected;
  end if;
  return new;
end;
$$;

create trigger classes_event_type_check
before insert or update of event_id on public.classes
for each row execute function public.assert_event_subtype('class');

create trigger seminars_event_type_check
before insert or update of event_id on public.seminars
for each row execute function public.assert_event_subtype('seminar');

create trigger workshops_event_type_check
before insert or update of event_id on public.workshops
for each row execute function public.assert_event_subtype('workshop');

create trigger gradings_event_type_check
before insert or update of event_id on public.gradings
for each row execute function public.assert_event_subtype('grading');

-- ---------------------------------------------------------------------------
-- 7. Grading records
-- ---------------------------------------------------------------------------

create table public.grading_applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  grading_event_id uuid not null references public.gradings(event_id) on delete cascade,
  target_grade_id text not null references public.grades(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  status public.application_status not null default 'submitted',
  notes text,
  unique (student_id, grading_event_id),
  foreign key (grading_event_id, target_grade_id)
    references public.grading_target_grades (grading_event_id, grade_id)
);

create index grading_applications_student_idx on public.grading_applications (student_id);
create index grading_applications_event_idx on public.grading_applications (grading_event_id);

create table public.technique_sign_offs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  syllabus_item_id text not null references public.syllabus_items(id) on delete restrict,
  signed_off_at timestamptz not null default now(),
  signed_off_by uuid references public.instructors(id) on delete set null,
  note text,
  unique (student_id, syllabus_item_id)
);

create index technique_sign_offs_student_idx on public.technique_sign_offs (student_id);
create index technique_sign_offs_item_idx on public.technique_sign_offs (syllabus_item_id);

-- ---------------------------------------------------------------------------
-- 8. Availability and email
-- ---------------------------------------------------------------------------

create table public.instructor_availability (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create index instructor_availability_instructor_idx
on public.instructor_availability (instructor_id, date);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  template public.notification_template not null,
  subject text not null,
  audience_label text not null,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0)
);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  email text not null,
  status public.notification_delivery_status not null default 'pending',
  error text,
  provider_message_id text,
  updated_at timestamptz not null default now(),
  unique (notification_id, email)
);

create index notification_recipients_notification_idx
on public.notification_recipients (notification_id);

-- ---------------------------------------------------------------------------
-- 9. updated_at triggers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger centres_set_updated_at before update on public.centres
for each row execute function public.set_updated_at();
create trigger instructors_set_updated_at before update on public.instructors
for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger notification_recipients_set_updated_at before update on public.notification_recipients
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. RLS helpers
-- ---------------------------------------------------------------------------

create function public.is_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'administrator'::public.user_role
     from public.users where id = (select auth.uid())),
    false
  );
$$;

create function public.current_instructor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.instructors where user_id = (select auth.uid()) limit 1;
$$;

create function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.students where user_id = (select auth.uid()) limit 1;
$$;

create function public.instructor_teaches_event(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events
    where id = target and instructor_id = public.current_instructor_id()
  );
$$;

create function public.instructor_can_see_student(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_students es
    join public.events e on e.id = es.event_id
    where es.student_id = target
      and e.instructor_id = public.current_instructor_id()
  );
$$;

create function public.student_received_notification(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notification_recipients
    where notification_id = target
      and student_id = public.current_student_id()
  );
$$;

revoke all on function public.is_administrator() from public, anon;
revoke all on function public.current_instructor_id() from public, anon;
revoke all on function public.current_student_id() from public, anon;
revoke all on function public.instructor_teaches_event(uuid) from public, anon;
revoke all on function public.instructor_can_see_student(uuid) from public, anon;
revoke all on function public.student_received_notification(uuid) from public, anon;

grant execute on function public.is_administrator() to authenticated;
grant execute on function public.current_instructor_id() to authenticated;
grant execute on function public.current_student_id() to authenticated;
grant execute on function public.instructor_teaches_event(uuid) to authenticated;
grant execute on function public.instructor_can_see_student(uuid) to authenticated;
grant execute on function public.student_received_notification(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. RLS policies
-- ---------------------------------------------------------------------------

alter table public.grades enable row level security;
alter table public.grade_tracks enable row level security;
alter table public.syllabus_items enable row level security;
alter table public.class_types enable row level security;
alter table public.centres enable row level security;
alter table public.instructors enable row level security;
alter table public.students enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.student_medical_alerts enable row level security;
alter table public.events enable row level security;
alter table public.classes enable row level security;
alter table public.seminars enable row level security;
alter table public.workshops enable row level security;
alter table public.gradings enable row level security;
alter table public.grading_target_grades enable row level security;
alter table public.event_students enable row level security;
alter table public.grading_applications enable row level security;
alter table public.technique_sign_offs enable row level security;
alter table public.instructor_availability enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;

create policy "Authenticated read grades" on public.grades
for select to authenticated using (true);
create policy "Admins manage grades" on public.grades
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Authenticated read grade tracks" on public.grade_tracks
for select to authenticated using (true);
create policy "Admins manage grade tracks" on public.grade_tracks
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Authenticated read syllabus" on public.syllabus_items
for select to authenticated using (true);
create policy "Admins manage syllabus" on public.syllabus_items
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Authenticated read class types" on public.class_types
for select to authenticated using (true);
create policy "Admins manage class types" on public.class_types
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Authenticated read centres" on public.centres
for select to authenticated using (true);
create policy "Admins manage centres" on public.centres
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Authenticated read instructors" on public.instructors
for select to authenticated using (true);
create policy "Admins manage instructors" on public.instructors
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Students, instructors and admins read students" on public.students
for select to authenticated
using (
  public.is_administrator()
  or user_id = (select auth.uid())
  or public.instructor_can_see_student(id)
);
create policy "Admins manage students" on public.students
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Students, instructors and admins read emergency contacts" on public.emergency_contacts
for select to authenticated
using (
  public.is_administrator()
  or public.instructor_can_see_student(student_id)
  or student_id = public.current_student_id()
);
create policy "Admins manage emergency contacts" on public.emergency_contacts
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Students, instructors and admins read medical alerts" on public.student_medical_alerts
for select to authenticated
using (
  public.is_administrator()
  or public.instructor_can_see_student(student_id)
  or student_id = public.current_student_id()
);
create policy "Admins manage medical alerts" on public.student_medical_alerts
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Authenticated read events" on public.events
for select to authenticated using (true);
create policy "Admins and event instructors manage events" on public.events
for all to authenticated
using (public.is_administrator() or instructor_id = public.current_instructor_id())
with check (public.is_administrator() or instructor_id = public.current_instructor_id());

create policy "Authenticated read classes" on public.classes
for select to authenticated using (true);
create policy "Admins and event instructors manage classes" on public.classes
for all to authenticated
using (public.is_administrator() or public.instructor_teaches_event(event_id))
with check (public.is_administrator() or public.instructor_teaches_event(event_id));

create policy "Authenticated read seminars" on public.seminars
for select to authenticated using (true);
create policy "Admins and event instructors manage seminars" on public.seminars
for all to authenticated
using (public.is_administrator() or public.instructor_teaches_event(event_id))
with check (public.is_administrator() or public.instructor_teaches_event(event_id));

create policy "Authenticated read workshops" on public.workshops
for select to authenticated using (true);
create policy "Admins and event instructors manage workshops" on public.workshops
for all to authenticated
using (public.is_administrator() or public.instructor_teaches_event(event_id))
with check (public.is_administrator() or public.instructor_teaches_event(event_id));

create policy "Authenticated read gradings" on public.gradings
for select to authenticated using (true);
create policy "Admins and event instructors manage gradings" on public.gradings
for all to authenticated
using (public.is_administrator() or public.instructor_teaches_event(event_id))
with check (public.is_administrator() or public.instructor_teaches_event(event_id));

create policy "Authenticated read grading targets" on public.grading_target_grades
for select to authenticated using (true);
create policy "Admins and event instructors manage grading targets" on public.grading_target_grades
for all to authenticated
using (public.is_administrator() or public.instructor_teaches_event(grading_event_id))
with check (public.is_administrator() or public.instructor_teaches_event(grading_event_id));

create policy "Participants read event students" on public.event_students
for select to authenticated
using (
  public.is_administrator()
  or public.instructor_teaches_event(event_id)
  or student_id = public.current_student_id()
);
create policy "Admins and event instructors manage event students" on public.event_students
for all to authenticated
using (public.is_administrator() or public.instructor_teaches_event(event_id))
with check (public.is_administrator() or public.instructor_teaches_event(event_id));

create policy "Students and instructors read applications" on public.grading_applications
for select to authenticated
using (
  public.is_administrator()
  or student_id = public.current_student_id()
  or public.instructor_can_see_student(student_id)
);
create policy "Admins manage applications" on public.grading_applications
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Students and instructors read sign offs" on public.technique_sign_offs
for select to authenticated
using (
  public.is_administrator()
  or student_id = public.current_student_id()
  or public.instructor_can_see_student(student_id)
);
create policy "Admins and instructors manage sign offs" on public.technique_sign_offs
for all to authenticated
using (
  public.is_administrator()
  or public.instructor_can_see_student(student_id)
)
with check (
  public.is_administrator()
  or (
    public.instructor_can_see_student(student_id)
    and signed_off_by = public.current_instructor_id()
  )
);

create policy "Authenticated read availability" on public.instructor_availability
for select to authenticated using (true);
create policy "Instructors manage their availability" on public.instructor_availability
for all to authenticated
using (public.is_administrator() or instructor_id = public.current_instructor_id())
with check (public.is_administrator() or instructor_id = public.current_instructor_id());

create policy "Admins and recipients read notifications" on public.notifications
for select to authenticated
using (public.is_administrator() or public.student_received_notification(id));
create policy "Admins manage notifications" on public.notifications
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

create policy "Admins and recipients read notification recipients" on public.notification_recipients
for select to authenticated
using (public.is_administrator() or student_id = public.current_student_id());
create policy "Admins manage notification recipients" on public.notification_recipients
for all to authenticated
using (public.is_administrator()) with check (public.is_administrator());

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
;
