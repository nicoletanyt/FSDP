-- A primary key of exactly (student_id, target_grade_id) made PostgREST treat
-- grading_endorsements as a many-to-many junction between students and grades,
-- so every `students -> grades(*)` embed became ambiguous (PGRST201, HTTP 300).
-- A surrogate key keeps one endorsement per student and target grade through a
-- unique constraint without creating a second students-grades relationship.
begin;

alter table public.grading_endorsements drop constraint grading_endorsements_pkey;
alter table public.grading_endorsements add column id uuid not null default gen_random_uuid();
alter table public.grading_endorsements add constraint grading_endorsements_pkey primary key (id);
alter table public.grading_endorsements
  add constraint grading_endorsements_student_grade_key unique (student_id, target_grade_id);

notify pgrst, 'reload schema';

commit;
