-- Separate a student with no membership application from pending applicants.
alter type public.membership_status add value if not exists 'non_member';
