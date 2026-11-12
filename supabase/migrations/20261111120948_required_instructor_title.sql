begin;

-- Titles become required, with an explicit 'none' for instructors without one.
-- Values mirror INSTRUCTOR_TITLES in supabase/functions/_shared/instructor-titles.ts.
-- Which titles a grade allows is enforced by that shared module in the
-- create-instructor Edge Function, not here.
alter table public.instructors drop constraint instructors_instructor_title_check;

update public.instructors set instructor_title = 'none' where instructor_title is null;

alter table public.instructors
  add constraint instructors_instructor_title_check
    check (instructor_title in ('none', 'fukushidoin', 'shidoin', 'shihan')),
  alter column instructor_title set default 'none',
  alter column instructor_title set not null;

comment on column public.instructors.instructor_title is
  'Required Aikikai instructor title: none, fukushidoin, shidoin or shihan. Independent of grade_id; minimum-grade rules live in the shared instructor-titles module. Administrators manage it; instructors cannot edit it.';

-- Missing title metadata provisions 'none'; an unknown value still fails the CHECK
-- and rolls back the entire auth-user creation.
create or replace function public.create_linked_instructor_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'instructor'::public.user_role then
    insert into public.instructors(user_id, first_name, last_name, email, grade_id, instructor_title)
    values (new.id, new.first_name, new.last_name, new.email,
      (select nullif(raw_app_meta_data ->> 'instructor_grade_id', '') from auth.users where id = new.id),
      coalesce((select nullif(raw_app_meta_data ->> 'instructor_title', '') from auth.users where id = new.id), 'none'))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- Grade is required for new instructors by the form and Edge Function. Existing
-- ungraded rows are reported, never guessed; add NOT NULL once they are assigned.
do $$
declare
  ungraded text;
begin
  select string_agg(format('%s %s <%s>', first_name, last_name, email), ', ' order by last_name, first_name)
    into ungraded from public.instructors where grade_id is null;
  if ungraded is not null then
    raise notice 'Instructors without a grade (assign before adding NOT NULL): %', ungraded;
  end if;
end;
$$;

commit;
