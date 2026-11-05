-- One administrator-managed, shared default for adult and children's invitations.
create table public.grading_invitation_settings (
  id boolean primary key default true check (id),
  subject text not null check (length(trim(subject)) between 1 and 150 and subject !~ '[\r\n]'),
  body text not null check (
    length(trim(body)) between 1 and 5000
    and position('{{grading_details}}' in body) > 0
    and position('{{application_url}}' in body) > 0
  ),
  updated_at timestamptz not null default now()
);

insert into public.grading_invitation_settings (id, subject, body) values (
  true,
  'Aikido Shinju-Kai | Grading invitation',
  'Dear Student,

You are invited to apply for an upcoming Aikido Shinju-Kai grading.

Grading details
{{grading_details}}

Venue
Aikido Shinju-Kai Headquarters
Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630

Apply here: {{application_url}}

Please apply by the closing date shown for your grading. When you sign in, you will see only the grading opportunities available to you. Your application is submitted after payment is confirmed.

We look forward to seeing you on the mat.

Aikido Shinju-Kai'
);

alter table public.grading_invitation_settings enable row level security;
create policy "Administrators read invitation wording" on public.grading_invitation_settings
  for select to authenticated using (public.is_administrator());
create policy "Administrators update invitation wording" on public.grading_invitation_settings
  for update to authenticated using (public.is_administrator()) with check (public.is_administrator());
grant select, update on public.grading_invitation_settings to authenticated;

-- Archived sends have a null event ID. An all-events send is distinguished by
-- its campaign key, the stable hash of the currently open grading event IDs.
alter table public.grading_email_sends add column campaign_key text;
create unique index grading_email_one_all_campaign on public.grading_email_sends(campaign_key)
  where campaign_key is not null and status in ('pending', 'accepted');
;
