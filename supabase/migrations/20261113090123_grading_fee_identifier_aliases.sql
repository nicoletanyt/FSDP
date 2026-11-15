-- Production grade IDs include belt colours and ordinals; these are not the
-- short IDs used by the legacy fee-preview catalogue. Preserve configured fees.
update public.grade_requirements r set fee_cents=f.cents
from (values
  ('red-12th-kyu',4500),('red-gold-11th-kyu',4500),('yellow-10th-kyu',4500),
  ('orange-9th-kyu',4500),('green-8th-kyu',4500),('purple-7th-kyu',4500),
  ('blue-6th-kyu',5000),('blue-silver-6th-kyu',5000),('blue-gold-5th-kyu',5500),
  ('brown-4th-kyu',6000),('brown-silver-4th-kyu',6000),('brown-gold-3rd-kyu',6500),
  ('black-2nd-kyu',9000),('black-silver-2nd-kyu',9000),('black-gold-1st-kyu',9500),
  ('1st-dan',53500),('2nd-dan',59000),('3rd-dan',69500),('4th-dan',91000)
) f(grade_id,cents) where r.grade_id=f.grade_id and r.fee_cents is null;
