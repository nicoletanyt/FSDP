-- Instructor endorsements for grading. An instructor may endorse a student for
-- their next grade only once the student meets every grading eligibility
-- requirement (student_grading_readiness, the same check used for invitations).
-- One endorsement per student and target grade; it is shown on the grading
-- checklist. Endorsement does not change eligibility.
begin;

create table public.grading_endorsements (
  student_id uuid not null references public.students(id) on delete cascade,
  target_grade_id text not null references public.grades(id) on delete restrict,
  endorsed_by uuid references public.instructors(id) on delete set null,
  endorsed_at timestamptz not null default now(),
  primary key (student_id, target_grade_id)
);

create index grading_endorsements_endorsed_by_idx on public.grading_endorsements (endorsed_by);

alter table public.grading_endorsements enable row level security;
-- Reads go through the functions below; administrators may also read directly.
create policy "Administrators read grading endorsements" on public.grading_endorsements
  for select to authenticated using (public.is_administrator());
grant select on public.grading_endorsements to authenticated;

-- The student's next grade, whether they meet every requirement, and any
-- endorsement for that grade.
create or replace function public.grading_endorsement_status(target_student uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target text;
  ready boolean;
begin
  if public.current_instructor_id() is null then
    raise exception 'Only instructors can view endorsements' using errcode = '42501';
  end if;
  select r.target_grade_id, bool_and(r.met) into target, ready
  from public.student_grading_readiness(target_student) r
  group by r.target_grade_id;
  return jsonb_build_object(
    'target_grade_id', target,
    'eligible', coalesce(ready, false),
    'endorsement', (
      select jsonb_build_object('endorsed_at', e.endorsed_at,
        'endorsed_by', nullif(trim(concat_ws(' ', i.first_name, i.last_name)), ''))
      from public.grading_endorsements e
      left join public.instructors i on i.id = e.endorsed_by
      where e.student_id = target_student and e.target_grade_id = target));
end;
$$;

-- Endorse the student for `expected_grade`, which must still be their next
-- grade with every requirement met. Endorsing twice keeps the first record.
create or replace function public.endorse_grading_student(target_student uuid, expected_grade text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  instructor uuid := public.current_instructor_id();
  target text;
  ready boolean;
begin
  if instructor is null then
    raise exception 'Only instructors can endorse students' using errcode = '42501';
  end if;
  select r.target_grade_id, bool_and(r.met) into target, ready
  from public.student_grading_readiness(target_student) r
  group by r.target_grade_id;
  if target is null or target is distinct from expected_grade then
    raise exception 'The student''s next grade has changed. Refresh and try again.' using errcode = '40001';
  end if;
  if not ready then
    raise exception 'The student does not meet every grading requirement yet.' using errcode = '22023';
  end if;
  insert into public.grading_endorsements (student_id, target_grade_id, endorsed_by)
  values (target_student, target, instructor)
  on conflict (student_id, target_grade_id) do nothing;
  return public.grading_endorsement_status(target_student);
end;
$$;

-- Endorsements matching each candidate's applied target grade in a grading.
create or replace function public.grading_event_endorsements(target_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_instructor_id() is null then
    raise exception 'Only instructors can view endorsements' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('student_id', a.student_id, 'target_grade_id', a.target_grade_id,
      'endorsed_at', e.endorsed_at, 'endorsed_by', nullif(trim(concat_ws(' ', i.first_name, i.last_name)), ''))
      order by a.student_id)
    from public.grading_applications a
    join public.grading_endorsements e on e.student_id = a.student_id and e.target_grade_id = a.target_grade_id
    left join public.instructors i on i.id = e.endorsed_by
    where a.grading_event_id = target_event), '[]'::jsonb);
end;
$$;

revoke all on function public.grading_endorsement_status(uuid) from public, anon;
revoke all on function public.endorse_grading_student(uuid, text) from public, anon;
revoke all on function public.grading_event_endorsements(uuid) from public, anon;
grant execute on function public.grading_endorsement_status(uuid) to authenticated;
grant execute on function public.endorse_grading_student(uuid, text) to authenticated;
grant execute on function public.grading_event_endorsements(uuid) to authenticated;

commit;
