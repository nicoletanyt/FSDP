-- The fetched reset migration has no grade_requirements policies. The instructor
-- read migration enables RLS, so make its intended reference access explicit.
begin;
do $$ begin
  if not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'grade_requirements'
      and policyname = 'Authenticated read grade requirements') then
    create policy "Authenticated read grade requirements" on public.grade_requirements
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'grade_requirements'
      and policyname = 'Admins manage grade requirements') then
    create policy "Admins manage grade requirements" on public.grade_requirements
      for all to authenticated
      using (public.is_administrator()) with check (public.is_administrator());
  end if;
end $$;
commit;
