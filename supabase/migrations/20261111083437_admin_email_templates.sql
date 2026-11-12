-- Fixed administrator-managed copy, separate from EmailJS's delivery template.
-- Preserve the existing grading wording without replacing or deleting it.
create table public.admin_email_templates (
  id text primary key check (id in ('grading_invitation', 'attendance_notice')),
  subject text not null check (length(trim(subject)) between 1 and 150 and subject !~ '[\r\n]'),
  body text not null check (length(trim(body)) between 1 and 5000),
  updated_at timestamptz not null default now(),
  constraint template_placeholders_check check (
    (id = 'grading_invitation'
      and body like '%{{children_grading_date}}%'
      and body like '%{{children_application_close_date}}%'
      and body like '%{{adult_grading_date}}%'
      and body like '%{{adult_application_close_date}}%'
      and length(body) - length(replace(body, 'https://fsdp-kappa.vercel.app/grading', '')) = length('https://fsdp-kappa.vercel.app/grading')
      and replace(replace(replace(replace(body,
        '{{children_grading_date}}', ''), '{{children_application_close_date}}', ''),
        '{{adult_grading_date}}', ''), '{{adult_application_close_date}}', '') !~ '\{\{[^}]*\}\}')
    or (id = 'attendance_notice'
      and body like '%{{student_name}}%'
      and replace(body, '{{student_name}}', '') !~ '\{\{[^}]*\}\}')
  )
);

insert into public.admin_email_templates (id, subject, body, updated_at)
select 'grading_invitation', subject, body, updated_at
from public.grading_invitation_settings where id = true;

insert into public.admin_email_templates (id, subject, body) values (
  'attendance_notice',
  'Aikido Shinju-Kai | Checking in',
  'Dear {{student_name}},

We noticed you have missed some recent classes and wanted to check in. If anything is making it difficult to attend, please reply so we can see how to support you.

If your attendance has been recorded incorrectly, please let us know and we will review it.

We hope to see you on the mat soon.

Aikido Shinju-Kai'
);

create function public.admin_email_templates_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger admin_email_templates_updated_at before update on public.admin_email_templates
for each row execute function public.admin_email_templates_set_updated_at();

alter table public.admin_email_templates enable row level security;
create policy "Administrators read email templates" on public.admin_email_templates
  for select to authenticated using (public.is_administrator());
create policy "Administrators edit email templates" on public.admin_email_templates
  for update to authenticated using (public.is_administrator()) with check (public.is_administrator());
revoke all on public.admin_email_templates from public, anon, authenticated;
grant select (id, subject, body, updated_at), update (subject, body) on public.admin_email_templates to authenticated;
