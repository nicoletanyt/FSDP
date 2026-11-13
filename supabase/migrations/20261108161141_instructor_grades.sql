alter table public.instructors
  add column grade_id text references public.grades(id) on delete restrict;

create index instructors_grade_id_idx on public.instructors (grade_id);

-- App metadata is set by the trusted provisioning function, not by the user.
-- The FK makes an invalid grade fail the entire auth-user creation transaction.
create or replace function public.create_linked_instructor_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'instructor'::public.user_role then
    insert into public.instructors(user_id, first_name, last_name, email, grade_id)
    values (new.id, new.first_name, new.last_name, new.email,
      (select nullif(raw_app_meta_data ->> 'instructor_grade_id', '') from auth.users where id = new.id))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
