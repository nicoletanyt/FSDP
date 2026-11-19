-- Preserve the original failed invitation and constrain retries to one
-- explicitly approved attempt per invitation. Service-only audit, no Data API
-- access for instructors or admins.
create table public.class_cover_invitation_retry_audit (
  invitation_id uuid primary key references public.class_cover_test_invitations(id) on delete restrict,
  original_provider_http_status integer not null,
  original_failure_reason text,
  status text not null default 'sending' check (status in ('sending', 'accepted', 'failed', 'uncertain')),
  provider_http_status integer check (provider_http_status between 100 and 599),
  failure_reason text check (length(failure_reason) <= 160),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.class_cover_invitation_retry_audit enable row level security;
revoke all on public.class_cover_invitation_retry_audit from public, anon, authenticated;
grant select, insert, update on public.class_cover_invitation_retry_audit to service_role;
comment on table public.class_cover_invitation_retry_audit is
  'One manually authorized retry per failed cover invitation; original outcome is preserved here. Sending or uncertain attempts are never retried automatically.';
