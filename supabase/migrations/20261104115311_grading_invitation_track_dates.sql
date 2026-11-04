-- Preserve administrator edits: only transform the known, unmodified default.
do $$ begin
  if not exists (
    select 1 from public.grading_invitation_settings
    where id = true and md5(body) = '6160835518555702aa8e1004e50a07c0'
  ) then
    raise exception 'Invitation wording was edited; migrate its placeholders manually before changing the constraint';
  end if;
end $$;

alter table public.grading_invitation_settings
  drop constraint grading_invitation_settings_body_check;

update public.grading_invitation_settings
set body = replace(
    replace(body,
      E'Grading details\n{{grading_details}}',
      E'Children''s grading\nDate: {{children_grading_date}}\nApplications close: {{children_application_close_date}}\n\nAdult grading\nDate: {{adult_grading_date}}\nApplications close: {{adult_application_close_date}}'
    ),
    E'Apply here: {{application_url}}\n\n', ''
  ),
  updated_at = now()
where id = true;

alter table public.grading_invitation_settings
  add constraint grading_invitation_settings_body_check check (
    length(trim(body)) between 1 and 5000
    and position('{{children_grading_date}}' in body) > 0
    and position('{{children_application_close_date}}' in body) > 0
    and position('{{adult_grading_date}}' in body) > 0
    and position('{{adult_application_close_date}}' in body) > 0
    and position('{{grading_details}}' in body) = 0
    and position('{{application_url}}' in body) = 0
  );
