-- Optional key fob (an NFC tag for attendance) bought with the membership.
-- A paid order is flagged on the student until staff issue a tag with
-- scripts/nfc-tags.mjs, which inserts into student_nfc_tags.
begin;

alter table public.students
  add column if not exists key_fob_status text check (key_fob_status in ('ordered', 'issued')),
  add column if not exists key_fob_ordered_at timestamptz;

comment on column public.students.key_fob_status is
  'Key fob bought with the membership: null = not ordered, ordered = paid and awaiting a tag, issued = a tag has been issued.';

-- Same activation and payment record as before, plus the key fob order.
drop function if exists public.finalize_membership_checkout(uuid, text, integer, text);
drop function if exists public.finalize_membership_checkout(uuid, text, integer, text, boolean);

create function public.finalize_membership_checkout(
  student uuid, stripe_session text, paid_amount integer, paid_currency text, key_fob boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if stripe_session is null or paid_amount is null or paid_amount <= 0 then
    raise exception 'Invalid membership payment';
  end if;

  update public.students s
    set membership_status = 'active', updated_at = now()
    where s.id = student and s.user_id is not null;
  if not found then raise exception 'Unknown membership applicant'; end if;

  insert into public.payments (
    student_id, item, description, amount_cents, currency, status, stripe_session_id, paid_at
  ) values (
    student, 'Membership',
    case when key_fob then 'Membership fee + key fob' else 'Membership fee' end,
    paid_amount, lower(paid_currency), 'paid', stripe_session, now()
  )
  on conflict (stripe_session_id) do update
    set status = 'paid', paid_at = coalesce(public.payments.paid_at, now()),
        amount_cents = excluded.amount_cents, currency = excluded.currency,
        description = excluded.description
    where public.payments.student_id = excluded.student_id;

  -- A webhook retry keeps the first order time; an issued fob is never reset.
  if key_fob then
    update public.students
      set key_fob_status = 'ordered', key_fob_ordered_at = coalesce(key_fob_ordered_at, now()), updated_at = now()
      where id = student and key_fob_status is null;
  end if;
end; $$;

revoke all on function public.finalize_membership_checkout(uuid, text, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.finalize_membership_checkout(uuid, text, integer, text, boolean) to service_role;

-- Issuing a tag (scripts/nfc-tags.mjs) fulfils an outstanding order.
create or replace function public.mark_key_fob_issued()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.students
    set key_fob_status = 'issued', updated_at = now()
    where id = new.student_id and key_fob_status = 'ordered';
  return new;
end; $$;
revoke all on function public.mark_key_fob_issued() from public, anon, authenticated;

drop trigger if exists student_nfc_tags_mark_key_fob_issued on public.student_nfc_tags;
create trigger student_nfc_tags_mark_key_fob_issued
  after insert on public.student_nfc_tags
  for each row execute function public.mark_key_fob_issued();

notify pgrst, 'reload schema';
commit;
