-- Tag IDs are opaque bearer tokens. Store only their SHA-256 hashes, never the URL token.
create table public.student_nfc_tags (
  student_id uuid not null references public.students(id) on delete cascade,
  tag_id text not null check (tag_id ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default now(),
  primary key (student_id, tag_id),
  unique (tag_id)
);

alter table public.student_nfc_tags enable row level security;
revoke all on public.student_nfc_tags from public, anon, authenticated;
grant select, insert, delete on public.student_nfc_tags to service_role;

-- Only the authenticated Edge Function's service-role client can execute this RPC.
-- Class lookup, assignment, idempotency and the time window are enforced here,
-- so changing a request or bypassing the page cannot mark another class.
create function public.nfc_scan_attendance(p_actor uuid, p_tag_id text, p_event uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_instructor uuid;
  v_student uuid;
  v_student_name text;
  v_event uuid;
  v_name text;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer;
  v_active_count integer;
  v_choices jsonb;
  v_record public.event_students%rowtype;
  v_details jsonb;
begin
  if not exists (select 1 from public.users where id = p_actor and role = 'instructor') then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select id into v_instructor from public.instructors where user_id = p_actor;
  if v_instructor is null then return jsonb_build_object('status', 'unlinked'); end if;
  if p_tag_id is null or p_tag_id !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Serialize scans against tag deletion; no client receives the stored hash.
  select student_id into v_student from public.student_nfc_tags
    where tag_id = p_tag_id for update;
  if v_student is null then return jsonb_build_object('status', 'invalid'); end if;
  select first_name || ' ' || last_name into v_student_name
    from public.students where id = v_student;

  select count(*), coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e.id, 'class_name', e.name, 'starts_at', e.starts_at, 'ends_at', e.ends_at
  ) order by e.starts_at), '[]'::jsonb) into v_count, v_choices
    from public.events e
    join public.event_students es on es.event_id = e.id and es.student_id = v_student
    where e.instructor_id = v_instructor and e.event_type = 'class'
      and e.status in ('scheduled', 'completed')
      and (e.starts_at at time zone 'Asia/Singapore')::date =
        (now() at time zone 'Asia/Singapore')::date;
  if v_count = 0 then
    return jsonb_build_object('status', 'no_class', 'student_name', v_student_name);
  end if;

  if p_event is null then
    select count(*) into v_active_count from public.events e
      join public.event_students es on es.event_id = e.id and es.student_id = v_student
      where e.instructor_id = v_instructor and e.event_type = 'class'
        and e.status in ('scheduled', 'completed')
        and (e.starts_at at time zone 'Asia/Singapore')::date =
          (now() at time zone 'Asia/Singapore')::date
        and now() between e.starts_at - interval '10 minutes' and e.ends_at;
    if v_active_count > 1 then
      select jsonb_agg(jsonb_build_object(
        'event_id', e.id, 'class_name', e.name, 'starts_at', e.starts_at, 'ends_at', e.ends_at
      ) order by e.starts_at) into v_choices from public.events e
        join public.event_students es on es.event_id = e.id and es.student_id = v_student
        where e.instructor_id = v_instructor and e.event_type = 'class'
          and e.status in ('scheduled', 'completed')
          and (e.starts_at at time zone 'Asia/Singapore')::date =
            (now() at time zone 'Asia/Singapore')::date
          and now() between e.starts_at - interval '10 minutes' and e.ends_at;
      return jsonb_build_object('status', 'select_class', 'student_name', v_student_name, 'classes', v_choices);
    end if;
  end if;

  select e.id, e.name, e.starts_at, e.ends_at into v_event, v_name, v_start, v_end
    from public.events e
    join public.event_students es on es.event_id = e.id and es.student_id = v_student
    where e.instructor_id = v_instructor and e.event_type = 'class'
      and e.status in ('scheduled', 'completed')
      and (e.starts_at at time zone 'Asia/Singapore')::date =
        (now() at time zone 'Asia/Singapore')::date
      and (p_event is null or e.id = p_event)
    order by
      case when now() between e.starts_at - interval '10 minutes' and e.ends_at then 0
           when e.starts_at > now() then 1 else 2 end,
      case when e.starts_at > now() then e.starts_at end asc,
      e.starts_at desc
    limit 1;
  if v_event is null then return jsonb_build_object('status', 'wrong_class'); end if;

  select * into v_record from public.event_students
    where event_id = v_event and student_id = v_student for update;
  v_details := jsonb_build_object('student_name', v_student_name,
    'class_name', v_name, 'event_id', v_event, 'starts_at', v_start, 'ends_at', v_end);

  if v_record.checked_in_at is not null or v_record.attendance_status in ('present', 'late') then
    return v_details || jsonb_build_object('status', 'marked', 'already_marked', true);
  end if;
  if v_record.attendance_status = 'excused' then
    return v_details || jsonb_build_object('status', 'excused');
  end if;
  if now() > v_end then
    return v_details || jsonb_build_object('status', 'absent');
  end if;
  if now() < v_start - interval '10 minutes' then
    return v_details || jsonb_build_object('status', 'upcoming');
  end if;
  if v_record.attendance_status = 'absent' then
    return v_details || jsonb_build_object('status', 'absent');
  end if;

  update public.event_students set attendance_status = 'present', checked_in_at = now(),
    recorded_at = now() where event_id = v_event and student_id = v_student
    returning * into v_record;
  return v_details || jsonb_build_object('status', 'marked', 'already_marked', false);
end $$;

revoke all on function public.nfc_scan_attendance(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.nfc_scan_attendance(uuid, text, uuid) to service_role;
