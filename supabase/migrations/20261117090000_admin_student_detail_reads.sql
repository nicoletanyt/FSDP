-- The student detail page is shared by instructors and administrators. Let
-- administrators through the student-read guard used by instructor_student_history
-- and instructor_student_summary. Write paths and require_instructor_account stay
-- instructor-only; administrators already read the underlying tables via RLS.
create or replace function public.require_instructor_student_read(target_student uuid)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if (select public.current_user_role()) is distinct from 'administrator'::public.user_role then
    perform public.require_instructor_account();
  end if;
  if not exists (select 1 from public.students where id = target_student) then
    raise exception 'Student is unavailable' using errcode = '42501';
  end if;
end;
$$;
