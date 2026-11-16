begin;

-- Keep grade persistence at the private Membership snapshot write boundary.
-- Replacing a public/private submission wrapper (e.g. to add name/email fields)
-- must not silently remove the initial-rank write again. Do not replace those
-- wrappers here: deployed installations can have additional user-owned logic.
create or replace function membership_private.sync_initial_membership_grade()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  member public.students%rowtype;
  selected_grade text;
  previous_grade text;
begin
  select * into member from public.students
    where id = new.student_id and user_id = new.user_id for update;
  if not found then raise exception 'Membership snapshot does not match its student account.'; end if;
  -- Initial applications may change their declared rank while still pending.
  -- Paid/expired memberships and actual grading history remain protected.
  if member.membership_status <> 'pending' or member.last_graded_at is not null then return new; end if;
  selected_grade := membership_private.resolve_current_grade(new.form_data);
  if member.current_grade_id is not distinct from selected_grade then return new; end if;

  if TG_OP = 'UPDATE' then
    begin
      previous_grade := membership_private.resolve_current_grade(old.form_data);
    exception when raise_exception then
      previous_grade := null;
    end;
  end if;
  -- Never replace an unrelated staff-managed/imported rank. A pending rank is
  -- editable only when it still equals this account's preceding declaration.
  if member.current_grade_id is null or member.current_grade_id = 'unranked'
    or (TG_OP = 'UPDATE' and member.current_grade_id = previous_grade) then
    update public.students set current_grade_id = selected_grade, updated_at = now()
      where id = member.id and user_id = new.user_id;
  end if;
  return new;
end $$;
revoke all on function membership_private.sync_initial_membership_grade() from public,anon,authenticated;

drop trigger if exists membership_application_sync_initial_grade on membership_private.application_details;
create trigger membership_application_sync_initial_grade
  after insert or update of form_data on membership_private.application_details
  for each row execute function membership_private.sync_initial_membership_grade();

-- No global data rewrite. Existing affected accounts are repaired separately
-- from their verified saved snapshots, with explicit IDs and history guards.
notify pgrst, 'reload schema';
commit;
