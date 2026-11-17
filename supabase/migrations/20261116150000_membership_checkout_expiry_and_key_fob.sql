-- Keep the key fob order (added in 20261116144113) and the membership expiry
-- protection (added in 20261116120000 / 20261116130000) in one checkout finalizer.
--
-- Two overloads of finalize_membership_checkout would make the four-argument RPC
-- call ambiguous, so there is now a single function with the key fob defaulted.

drop function if exists public.finalize_membership_checkout(uuid, text, integer, text);
drop function if exists public.finalize_membership_checkout(uuid, text, integer, text, boolean);

create or replace function public.finalize_membership_checkout(
  student uuid,
  stripe_session text,
  paid_amount integer,
  paid_currency text,
  key_fob boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Activation, the 12-month extension and the paid payment row (with replay
  -- protection) all live in finalize_membership_fee.
  perform public.finalize_membership_fee(
    student,
    stripe_session,
    case when key_fob then 'Membership fee + key fob' else 'Membership fee' end,
    12,
    paid_amount,
    paid_currency
  );

  -- A webhook retry keeps the first order time; an issued fob is never reset.
  if key_fob then
    update public.students
      set key_fob_status = 'ordered',
          key_fob_ordered_at = coalesce(key_fob_ordered_at, now()),
          updated_at = now()
      where id = student and key_fob_status is null;
  end if;
end; $$;

revoke all on function public.finalize_membership_checkout(uuid, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_membership_checkout(uuid, text, integer, text, boolean)
  to service_role;

notify pgrst, 'reload schema';
