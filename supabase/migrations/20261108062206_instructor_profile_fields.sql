begin;

drop trigger instructors_set_updated_at on public.instructors;

alter table public.instructors
  drop column updated_at,
  add column profile_picture_url text,
  add column employment_type text
    constraint instructors_employment_type_check
    check (employment_type in ('part_time', 'full_time'));

-- Instructor directory rows are readable by every authenticated account.
-- Keep home addresses separate so directory reads cannot expose them.
create table public.instructor_private_details (
  instructor_id uuid primary key references public.instructors(id) on delete cascade,
  address text
);

alter table public.instructor_private_details enable row level security;

revoke all on public.instructor_private_details from public, anon, authenticated;
grant select, insert, update, delete on public.instructor_private_details to authenticated;
grant all on public.instructor_private_details to service_role;

create policy "Instructors read their own private details"
on public.instructor_private_details
for select to authenticated
using (instructor_id = (select public.current_instructor_id()));

create policy "Admins manage instructor private details"
on public.instructor_private_details
for all to authenticated
using ((select public.is_administrator()))
with check ((select public.is_administrator()));

comment on column public.instructors.profile_picture_url is
  'Optional profile image URL; stores a reference, not image data.';
comment on column public.instructors.employment_type is
  'Optional employment classification: part_time or full_time. NULL means unspecified.';
comment on table public.instructor_private_details is
  'Private instructor information: administrators manage it and linked instructors can read their own row.';

commit;
