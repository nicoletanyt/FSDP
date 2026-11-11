-- Provider responses may echo credentials and personal data. Persist only a
-- bounded HTTP status and a server-classified, fixed diagnostic label.
alter table public.instructor_class_unavailability
  add column notification_http_status integer
    check (notification_http_status between 100 and 599),
  add column notification_failure_reason text
    check (length(notification_failure_reason) <= 160);
