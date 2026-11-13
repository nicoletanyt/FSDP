-- Administrator-editable instructor login copy; EmailJS remains the delivery transport.
alter table public.admin_email_templates
  drop constraint template_placeholders_check;

alter table public.admin_email_templates
  drop constraint admin_email_templates_id_check;

alter table public.admin_email_templates
  add constraint admin_email_templates_id_check
    check (id in ('grading_invitation', 'attendance_notice', 'instructor_account')),
  add constraint template_placeholders_check check (
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
    or (id = 'instructor_account'
      and body like '%{{first_name}}%'
      and body like '%{{login_url}}%'
      and body like '%{{email}}%'
      and body like '%{{password}}%'
      and replace(replace(replace(replace(body,
        '{{first_name}}', ''), '{{login_url}}', ''),
        '{{email}}', ''), '{{password}}', '') !~ '\{\{[^}]*\}\}')
  );

insert into public.admin_email_templates (id, subject, body) values (
  'instructor_account',
  'Your Aikido Shinju-Kai instructor login',
  'Hello {{first_name}},

Your instructor account has been created.

Sign in: {{login_url}}
Username: {{email}}
Password: {{password}}

Please change your password after you sign in.

Aikido Shinju-Kai'
);
