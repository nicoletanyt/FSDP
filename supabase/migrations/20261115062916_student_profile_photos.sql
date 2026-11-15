-- Student profile photos: uploaded on the membership application and shown on
-- the student's membership card. Same design as instructor photos (20261108064635).
-- Uploading only needs a student account (the student record is created when the
-- application is submitted, after the upload), but saving it as the student's
-- photo needs that record.
-- Files live in a private bucket under the student's own auth user ID:
--   student-photos/<auth user id>/<random uuid>.<jpg|png|webp>
-- New uploads get a new random name (no overwriting cached images); the
-- student record stores the object path, and pages create signed URLs to show it.
-- Who can see a photo: the student, plus instructors and administrators (who can
-- already read every student record). Students never see each other's photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']);

create policy "Students, instructors and admins read student photos" on storage.objects
for select to authenticated using (
  bucket_id = 'student-photos'
  and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or (select public.current_user_role()) in ('instructor', 'administrator')
  )
);

create policy "Students upload their own photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'student-photos'
  and (select public.current_user_role()) = 'student'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
);

create policy "Students delete their own photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'student-photos'
  and (select public.current_user_role()) = 'student'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

alter table public.students add column photo_path text;
comment on column public.students.photo_path is
  'Optional object path in the private student-photos bucket. Create signed URLs at read time; never store expiring URLs.';

-- Points the student's record at a photo they already uploaded, or clears it
-- (new_photo_path = null). expected_photo_path must match the current value so
-- two tabs can't silently overwrite each other's change.
create function public.save_my_student_photo(expected_photo_path text, new_photo_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  member public.students%rowtype;
begin
  if (select public.current_user_role()) is distinct from 'student' then
    raise exception 'Sign in as a student to change your photo.' using errcode = '42501';
  end if;
  select * into member from public.students where user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Your account is not linked to a student record.' using errcode = '42501';
  end if;
  if member.photo_path is distinct from expected_photo_path then
    raise exception 'Your photo changed. Reload your profile before trying again.' using errcode = 'PPR01';
  end if;
  if new_photo_path is not null then
    if split_part(new_photo_path, '/', 1) <> (select auth.uid())::text
      or new_photo_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
      or not exists (select 1 from storage.objects
        where bucket_id = 'student-photos' and name = new_photo_path) then
      raise exception 'Upload your photo first.' using errcode = '22023';
    end if;
  end if;
  update public.students set photo_path = new_photo_path, updated_at = now() where id = member.id;
  return jsonb_build_object('photo_path', new_photo_path);
end $$;

revoke all on function public.save_my_student_photo(text, text) from public, anon;
grant execute on function public.save_my_student_photo(text, text) to authenticated;
