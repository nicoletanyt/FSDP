-- The class's current assignment outranks a prior decline, so an invited
-- instructor sees the winner's result instead of a stale personal response.
-- This RPC still returns only the signed-in invited instructor's class data.
create or replace function public.get_class_cover_test_invitation(target_invitation uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'instructor'
  ) then raise exception 'Instructor access required' using errcode = '42501'; end if;

  select jsonb_build_object(
    'id', inv.id, 'class_name', e.name, 'starts_at', e.starts_at,
    'ends_at', e.ends_at, 'centre_name', c.name,
    'decision', inv.decision,
    'state', case
      when inv.decision = 'accepted' and e.instructor_id = inv.instructor_id
        and r.status = 'covered' then 'accepted'
      when e.instructor_id is distinct from r.instructor_id or r.status = 'covered' then 'covered'
      when inv.decision = 'declined' then 'declined'
      when inv.decision = 'accepted' then 'closed'
      when inv.status <> 'accepted' then 'not_sent'
      when r.status <> 'open' or e.status <> 'scheduled' or e.starts_at <= now() then 'closed'
      else 'open' end)
    into result
  from public.class_cover_test_invitations inv
  join public.instructors i on i.id = inv.instructor_id and i.user_id = auth.uid()
    and lower(i.email) ~ '^[^@]+@example([.]test)?[.]com$'
  join public.events e on e.id = inv.event_id and e.name = '[Cover Test] Weekday 3 PM'
    and e.event_type = 'class'
  join public.centres c on c.id = e.centre_id
  join public.instructor_class_unavailability r on r.event_id = e.id
  where inv.id = target_invitation;
  return result;
end;
$$;
