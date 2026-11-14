-- Rotating attendance QR codes.
--
-- A student's code is `ASK:ATT:v1:<event>:<student>:<minute>:<signature>`,
-- where <minute> is the Unix minute it was issued and <signature> is an HMAC
-- over the rest with a key that never leaves the database. A code therefore
-- only works for one booked class, one student and about two minutes (the
-- current minute plus one minute of grace for slow scans), so a forwarded
-- screenshot quickly stops working. Check-in follows the NFC rules: from 10
-- minutes before the class starts until it ends, marking the student present.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists attendance_private;
revoke all on schema attendance_private from public, anon, authenticated;

create table attendance_private.qr_key (
  id boolean primary key default true check (id),
  secret bytea not null default extensions.gen_random_bytes(32)
);
insert into attendance_private.qr_key default values;
revoke all on attendance_private.qr_key from public, anon, authenticated;

create function attendance_private.qr_signature(event uuid, student uuid, minute bigint)
returns text language sql stable security definer set search_path = '' as $$
  select left(encode(extensions.hmac(
    convert_to(format('v1:%s:%s:%s', event, student, minute), 'UTF8'),
    (select secret from attendance_private.qr_key), 'sha256'), 'hex'), 32);
$$;
revoke all on function attendance_private.qr_signature(uuid, uuid, bigint) from public, anon, authenticated;

-- The signed-in student's code for the booked class that is open for check-in.
create function public.student_attendance_qr()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_student uuid;
  v_minute bigint := floor(extract(epoch from now()) / 60);
  v_class record;
begin
  if (select public.current_user_role()) is distinct from 'student' then
    return jsonb_build_object('status', 'unavailable');
  end if;
  select id into v_student from public.students where user_id = (select auth.uid());
  if v_student is null then return jsonb_build_object('status', 'unavailable'); end if;

  -- Prefer a class that is open now; otherwise report the next one later today.
  select e.id, e.name, e.starts_at, e.ends_at, es.attendance_status, es.checked_in_at,
      now() between e.starts_at - interval '10 minutes' and e.ends_at as open
    into v_class
    from public.event_students es
    join public.events e on e.id = es.event_id
    where es.student_id = v_student and e.event_type = 'class'
      and e.status in ('scheduled', 'completed')
      and e.ends_at > now()
      and (e.starts_at at time zone 'Asia/Singapore')::date = (now() at time zone 'Asia/Singapore')::date
    order by (now() between e.starts_at - interval '10 minutes' and e.ends_at) desc, e.starts_at
    limit 1;

  if v_class.id is null then return jsonb_build_object('status', 'none'); end if;
  if not v_class.open then
    return jsonb_build_object('status', 'upcoming', 'event_id', v_class.id, 'class_name', v_class.name,
      'starts_at', v_class.starts_at, 'opens_at', v_class.starts_at - interval '10 minutes');
  end if;
  if v_class.checked_in_at is not null or v_class.attendance_status in ('present', 'late') then
    return jsonb_build_object('status', 'checked_in', 'event_id', v_class.id, 'class_name', v_class.name,
      'starts_at', v_class.starts_at);
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'event_id', v_class.id,
    'class_name', v_class.name,
    'starts_at', v_class.starts_at,
    'ends_at', v_class.ends_at,
    'payload', format('ASK:ATT:v1:%s:%s:%s:%s', v_class.id, v_student, v_minute,
      attendance_private.qr_signature(v_class.id, v_student, v_minute)),
    -- The client refreshes at the next minute; server_now lets it ignore clock skew.
    'server_now', now(),
    'refresh_at', to_timestamp((v_minute + 1) * 60)
  );
end $$;
revoke all on function public.student_attendance_qr() from public, anon;
grant execute on function public.student_attendance_qr() to authenticated;

-- An instructor scans a student's code for the class they teach (p_event).
create function public.check_in_with_qr(p_payload text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_instructor uuid;
  v_parts text[];
  v_event uuid;
  v_student uuid;
  v_minute bigint;
  v_now_minute bigint := floor(extract(epoch from now()) / 60);
  v_class public.events%rowtype;
  v_record public.event_students%rowtype;
  v_details jsonb;
begin
  if (select public.current_user_role()) is distinct from 'instructor' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select id into v_instructor from public.instructors where user_id = (select auth.uid());
  if v_instructor is null then return jsonb_build_object('status', 'forbidden'); end if;
  select * into v_class from public.events where id = p_event and event_type = 'class';
  if v_class.id is null or v_class.instructor_id is distinct from v_instructor then
    return jsonb_build_object('status', 'forbidden');
  end if;

  v_parts := regexp_match(coalesce(p_payload, ''),
    '^ASK:ATT:v1:([0-9a-f-]{36}):([0-9a-f-]{36}):([0-9]{1,12}):([0-9a-f]{32})$');
  if v_parts is null then return jsonb_build_object('status', 'invalid'); end if;
  v_event := v_parts[1]::uuid;
  v_student := v_parts[2]::uuid;
  v_minute := v_parts[3]::bigint;
  if v_parts[4] <> attendance_private.qr_signature(v_event, v_student, v_minute) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_minute not between v_now_minute - 1 and v_now_minute then
    return jsonb_build_object('status', 'expired');
  end if;

  select * into v_record from public.event_students
    where event_id = p_event and student_id = v_student for update;
  v_details := jsonb_build_object(
    'student_name', (select first_name || ' ' || last_name from public.students where id = v_student),
    'class_name', v_class.name, 'event_id', v_class.id);
  if v_event <> p_event then return v_details || jsonb_build_object('status', 'wrong_class'); end if;
  if v_record.student_id is null then return v_details || jsonb_build_object('status', 'not_booked'); end if;

  if v_record.checked_in_at is not null or v_record.attendance_status in ('present', 'late') then
    return v_details || jsonb_build_object('status', 'marked', 'already_marked', true);
  end if;
  if v_record.attendance_status = 'excused' then return v_details || jsonb_build_object('status', 'excused'); end if;
  if v_class.status = 'cancelled' then return v_details || jsonb_build_object('status', 'cancelled'); end if;
  if now() < v_class.starts_at - interval '10 minutes' then
    return v_details || jsonb_build_object('status', 'upcoming');
  end if;
  if now() > v_class.ends_at or v_record.attendance_status = 'absent' then
    return v_details || jsonb_build_object('status', 'absent');
  end if;

  update public.event_students set attendance_status = 'present', checked_in_at = now(), recorded_at = now()
    where event_id = p_event and student_id = v_student;
  return v_details || jsonb_build_object('status', 'marked', 'already_marked', false);
end $$;
revoke all on function public.check_in_with_qr(text, uuid) from public, anon;
grant execute on function public.check_in_with_qr(text, uuid) to authenticated;
