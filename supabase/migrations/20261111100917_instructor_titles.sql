begin;

-- Aikikai title, kept separate from grade_id and never derived from dan rank.
-- Values mirror INSTRUCTOR_TITLES in src/lib/instructor/titles.ts.
alter table public.instructors
  add column instructor_title text
    constraint instructors_instructor_title_check
    check (instructor_title in ('shihan', 'shidoin', 'fukushidoin'));

comment on column public.instructors.instructor_title is
  'Optional Aikikai instructor title: shihan, shidoin or fukushidoin. Independent of grade_id. NULL means none. Administrators manage it; instructors cannot edit it.';

-- App metadata is set by the trusted provisioning function, not by the user.
-- The FK and CHECK make an invalid grade or title fail the entire auth-user creation transaction.
create or replace function public.create_linked_instructor_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'instructor'::public.user_role then
    insert into public.instructors(user_id, first_name, last_name, email, grade_id, instructor_title)
    values (new.id, new.first_name, new.last_name, new.email,
      (select nullif(raw_app_meta_data ->> 'instructor_grade_id', '') from auth.users where id = new.id),
      (select nullif(raw_app_meta_data ->> 'instructor_title', '') from auth.users where id = new.id))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

commit;
