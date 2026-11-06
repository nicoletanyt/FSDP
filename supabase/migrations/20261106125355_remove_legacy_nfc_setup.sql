-- Retire the original NFC implementation while preserving attendance data.
-- checked_in_at predates NFC and must remain intact.
drop function if exists public.nfc_mark_attendance(uuid, uuid, text);
drop function if exists public.nfc_mark_manual_attendance(uuid, uuid, uuid);
drop function if exists public.nfc_issue_tag(uuid, uuid, text);
drop function if exists public.nfc_revoke_tag(uuid, uuid);

drop table if exists public.student_nfc_tags;

alter table public.event_students
  drop column if exists checked_in_by,
  drop column if exists check_in_source;
