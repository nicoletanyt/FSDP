begin;

-- Senior dan grades so instructors can hold every Aikikai title (Shihan needs
-- 6th dan). These are instructor-only grades: no grade_tracks, requirements or
-- syllabus rows, so student grading ladders (which join grade_tracks) never
-- offer them as a next grade.
insert into public.grades (id, label, colour, is_ranked, sort_order) values
  ('5th-dan', '5th Dan', 'Black', true, 21),
  ('6th-dan', '6th Dan', 'Black', true, 22)
on conflict (id) do nothing;

commit;
