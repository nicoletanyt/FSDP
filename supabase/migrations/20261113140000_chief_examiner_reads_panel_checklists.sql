-- The chief examiner can read every panel member's SUBMITTED grading checklist
-- for their grading (marks and comments), as administrators already can.
-- Other examiners still read only their own batches; drafts stay private.
-- grading_batch_students/_items/_results policies check visibility through
-- grading_batches, so they follow this policy automatically.
create policy "Chief examiners read submitted panel batches" on public.grading_batches
for select to authenticated
using (
  status = 'submitted'
  and exists (
    select 1 from public.grading_panel_members m
    where m.grading_event_id = grading_batches.event_id
      and m.instructor_id = (select public.current_instructor_id())
      and m.is_chief
  )
);
