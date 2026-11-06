-- Change only the known default; never overwrite administrator-edited wording.
do $$ begin
  if not exists (
    select 1 from public.grading_invitation_settings
    where id = true and subject = 'Aikido Shinju-Kai | Grading invitation'
      and md5(body) = '355488e4f6f95cf7c2086a8a682ffaca'
  ) then
    raise exception 'Invitation wording was edited; review it before setting the literal application link';
  end if;
end $$;

alter table public.grading_invitation_settings
  drop constraint grading_invitation_settings_link_marker_check;

update public.grading_invitation_settings
set body = replace(body, '[insert actual link here]', 'https://fsdp-kappa.vercel.app/grading'),
  updated_at = now()
where id = true;

alter table public.grading_invitation_settings
  add constraint grading_invitation_settings_link_check check (
    length(body) - length(replace(body, 'https://fsdp-kappa.vercel.app/grading', '')) = length('https://fsdp-kappa.vercel.app/grading')
    and position('[insert actual link here]' in body) = 0
  );
