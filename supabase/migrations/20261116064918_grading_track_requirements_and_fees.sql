begin;

-- Reassert the published per-track minimums and existing SOP examination fees.
-- Resolve only real catalogue IDs; support both known identifier conventions.
-- The readiness/checkout RPCs already join requirements by (grade_id, track),
-- so updating this shared source also updates checkout's server-side guards.
create temporary table grading_track_sheet (
  ids text[], track public.grade_track, min_months smallint, max_months smallint,
  min_sessions smallint, min_age_years smallint, fee_cents integer
) on commit drop;
insert into grading_track_sheet values
  (array['red-12th-kyu','12-kyu'],'children',3,null,null,5,4500),
  (array['red-gold-11th-kyu','11-kyu'],'children',4,null,null,null,4500),
  (array['yellow-10th-kyu','10-kyu'],'children',4,null,null,null,4500),
  (array['orange-9th-kyu','9-kyu'],'children',4,null,null,null,4500),
  (array['green-8th-kyu','8-kyu'],'children',4,6,null,null,4500),
  (array['purple-7th-kyu','7-kyu'],'children',6,null,null,null,4500),
  (array['blue-6th-kyu','6-kyu'],'children',6,null,null,null,5000),
  (array['blue-silver-6th-kyu','6-kyu-silver'],'children',6,null,null,null,5000),
  (array['blue-gold-5th-kyu','5-kyu'],'children',6,null,null,null,5500),
  (array['brown-4th-kyu','4-kyu'],'children',10,null,null,null,6000),
  (array['brown-silver-4th-kyu','4-kyu-silver'],'children',10,null,null,null,6000),
  (array['brown-gold-3rd-kyu','3-kyu'],'children',8,10,null,null,6500),
  (array['black-2nd-kyu','2-kyu'],'children',10,null,null,12,9000),
  (array['black-silver-2nd-kyu','2-kyu-silver'],'children',10,null,null,null,9000),
  (array['blue-6th-kyu','6-kyu'],'adult',3,null,20,null,5000),
  (array['blue-gold-5th-kyu','5-kyu'],'adult',0,null,24,null,5500),
  (array['brown-4th-kyu','4-kyu'],'adult',0,null,32,null,6000),
  (array['brown-gold-3rd-kyu','3-kyu'],'adult',6,null,36,null,6500),
  (array['black-2nd-kyu','2-kyu'],'adult',6,null,56,null,9000),
  (array['black-gold-1st-kyu','1-kyu'],'adult',9,null,62,null,9500);

insert into public.grade_tracks(grade_id, track)
select g.id, s.track from grading_track_sheet s join public.grades g on g.id = any(s.ids)
on conflict(grade_id, track) do nothing;

insert into public.grade_requirements(grade_id, track, min_months, max_months,
  min_sessions, min_age_years, max_age_years, fee_cents)
select g.id, s.track, s.min_months, s.max_months, s.min_sessions, s.min_age_years, null, s.fee_cents
from grading_track_sheet s join public.grades g on g.id = any(s.ids)
on conflict(grade_id, track) do update set
  min_months = excluded.min_months, max_months = excluded.max_months,
  min_sessions = excluded.min_sessions, min_age_years = excluded.min_age_years,
  max_age_years = excluded.max_age_years, fee_cents = excluded.fee_cents;

-- Do not modify Dan requirements, instructor sign-offs, membership minimums,
-- adult intermediate-grade exceptions, or the existing age-gated crossover
-- from the top children's grade to adult 1st Kyu. Issued checkout sessions also
-- retain their fixed amount/date rather than being repriced by this migration.
notify pgrst, 'reload schema';
commit;
