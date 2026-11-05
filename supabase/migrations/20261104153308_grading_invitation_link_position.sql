-- Only update the known default; do not overwrite administrator edits.
do $$ begin
  if not exists (
    select 1 from public.grading_invitation_settings
    where id = true and subject = 'Aikido Shinju-Kai | Grading invitation'
      and md5(body) = '447c177eed15381a4417d2d7e64fb935'
  ) then
    raise exception 'Invitation wording was edited; review it before updating the link position';
  end if;
end $$;

update public.grading_invitation_settings
set body = replace(body,
    E'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630\n\nPlease apply',
    E'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630\n\nApply here: [insert actual link here]\n\nPlease apply'
  ),
  updated_at = now()
where id = true;

alter table public.grading_invitation_settings
  add constraint grading_invitation_settings_link_marker_check check (
    position('[insert actual link here]' in body) > 0
    and length(body) - length(replace(body, '[insert actual link here]', '')) = length('[insert actual link here]')
  );
;
