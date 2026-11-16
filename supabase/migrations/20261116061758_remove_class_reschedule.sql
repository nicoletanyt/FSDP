-- Students can no longer reschedule a class booking: they cancel it (credits are
-- refunded to the original pass) and book another class instead.
--
-- change_booking (add_credit_batches, 20261115064757) is the only route clients
-- have into booking changes; change_booking_core is revoked from them. This
-- replaces it with the same body, except that:
--   * 'reschedule' is rejected before any booking rule runs, so nothing moves;
--   * the branch that moved a prepaid allocation to the new class is gone.
-- The signature is unchanged, so public.change_student_class_booking and its
-- grants keep working; original_id is now ignored.
begin;

create or replace function student_calendar_private.change_booking(action text,target_id uuid,original_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  member_id uuid;
  account public.credit_accounts%rowtype;
  allocation credit_private.booking_allocations%rowtype;
  batch public.credit_batches%rowtype;
  response jsonb;
begin
  -- Raised as P0001, so the app shows this message as written.
  if action = 'reschedule' then
    raise exception 'Classes can''t be rescheduled. Cancel this booking and book another class.';
  end if;
  if caller is null or (select public.current_user_role()) is distinct from 'student'::public.user_role then
    raise exception 'Sign in as a student to manage class bookings.';
  end if;
  select id into member_id from public.students where user_id = caller for update;
  if not found then raise exception 'Your account is not linked to a student membership.'; end if;
  select * into account from public.credit_accounts where user_id = caller for update;
  -- Core changes and credit writes share ONE transaction: any failure rolls back
  -- the seat as well as all batch/account/audit writes.
  response := student_calendar_private.change_booking_core(action,target_id,original_id);

  if action = 'enrol' then
    if account.user_id is null or not account.active then raise exception 'An active credit account is required.'; end if;
    -- Active unlimited passes take precedence without consuming finite credits.
    select * into batch from public.credit_batches where user_id = caller
      and expires_at > now() and unlimited order by expires_at,created_at,id limit 1 for update;
    if not found then
      -- FEFO (earliest expiry first), with deterministic FIFO tie-breaks.
      select * into batch from public.credit_batches where user_id = caller
        and expires_at > now() and not unlimited and credits_remaining > 0
        order by expires_at,created_at,id limit 1 for update;
      if not found then raise exception 'No unexpired credits available. Please top up.'; end if;
      update public.credit_batches set credits_remaining = credits_remaining - 1 where id = batch.id;
      insert into public.credit_batch_transactions(user_id,batch_id,event_id,delta)
      values(caller,batch.id,target_id,-1);
    end if;
    insert into credit_private.booking_allocations(event_id,student_id,batch_id,charged)
    values(target_id,member_id,batch.id,not batch.unlimited);
  elsif action = 'cancel' then
    select * into allocation from credit_private.booking_allocations
      where event_id = target_id and student_id = member_id for update;
    if found then
      if allocation.charged then
        -- Refund to the ORIGINAL batch without extending its expiration.
        update public.credit_batches set credits_remaining = credits_remaining + 1 where id = allocation.batch_id;
        insert into public.credit_batch_transactions(user_id,batch_id,event_id,delta)
        values(caller,allocation.batch_id,target_id,1);
      end if;
      delete from credit_private.booking_allocations where event_id = target_id and student_id = member_id;
    end if; -- Historical uncharged bookings never mint refund credits.
  end if;
  if account.user_id is not null then perform credit_private.sync_account(caller); end if;
  return response;
end; $$;

-- create or replace keeps existing privileges; restated so the access is explicit here.
revoke all on function student_calendar_private.change_booking(text,uuid,uuid) from public, anon, authenticated;
grant execute on function student_calendar_private.change_booking(text,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
