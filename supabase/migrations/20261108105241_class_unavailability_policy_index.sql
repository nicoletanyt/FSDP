-- Consolidate read policies and index the instructor FK for delete/reassignment checks.
create index instructor_class_unavailability_instructor_idx
  on public.instructor_class_unavailability(instructor_id);
drop policy "Admins see class-cover requests" on public.instructor_class_unavailability;
drop policy "Instructors see their own class-cover requests" on public.instructor_class_unavailability;
create policy "Admins and owners see class-cover requests" on public.instructor_class_unavailability
  for select to authenticated using (
    (select public.is_administrator())
    or (user_id = (select auth.uid()) and (select public.current_user_role()) = 'instructor')
  );
