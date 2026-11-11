begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instructor-photos', 'instructor-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']);

-- Photos may be displayed in the authenticated instructor directory, but are
-- never anonymously public. Immutable names avoid overwriting cached images.
create policy "Authenticated read instructor photos" on storage.objects
for select to authenticated using (bucket_id = 'instructor-photos');

create policy "Instructors upload their own photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'instructor-photos'
  and (select public.current_instructor_id()) is not null
  and split_part(name, '/', 1) = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
);

create policy "Instructors delete their own photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'instructor-photos'
  and (select public.current_instructor_id()) is not null
  and split_part(name, '/', 1) = (select auth.uid())::text
);

-- Narrow RPCs allow self-service without granting updates to names, employment
-- type, user_id, or another instructor's record.
create function public.save_instructor_address(expected_user uuid, new_address text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  saved_address text := nullif(btrim(new_address), '');
begin
  if (select auth.uid()) is null or expected_user is distinct from (select auth.uid()) then
    raise exception 'The signed-in account changed' using errcode = '42501';
  end if;
  select i.id into owner_id from public.instructors i
  join public.users u on u.id = i.user_id
  where u.id = (select auth.uid()) and u.role = 'instructor'
  for update of i;
  if owner_id is null then
    raise exception 'A linked instructor account is required' using errcode = '42501';
  end if;
  if char_length(saved_address) > 1000 then
    raise exception 'Use an address of 1000 characters or fewer' using errcode = '22023';
  end if;
  insert into public.instructor_private_details(instructor_id, address)
  values (owner_id, saved_address)
  on conflict (instructor_id) do update set address = excluded.address;
  return jsonb_build_object('address', saved_address);
end;
$$;

create function public.save_instructor_profile_photo(
  expected_user uuid, expected_photo_path text, new_photo_path text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  previous_path text;
begin
  if (select auth.uid()) is null or expected_user is distinct from (select auth.uid()) then
    raise exception 'The signed-in account changed' using errcode = '42501';
  end if;
  select i.id, i.profile_picture_url into owner_id, previous_path
  from public.instructors i join public.users u on u.id = i.user_id
  where u.id = (select auth.uid()) and u.role = 'instructor'
  for update of i;
  if owner_id is null then
    raise exception 'A linked instructor account is required' using errcode = '42501';
  end if;
  if previous_path is distinct from expected_photo_path then
    raise exception 'Your photo changed. Reload your profile before trying again' using errcode = 'PPR01';
  end if;
  if new_photo_path is not null then
    if split_part(new_photo_path, '/', 1) <> (select auth.uid())::text
      or new_photo_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
      or not exists (select 1 from storage.objects
        where bucket_id = 'instructor-photos' and name = new_photo_path) then
      raise exception 'Upload a profile photo to your own folder first' using errcode = '22023';
    end if;
  end if;
  update public.instructors set profile_picture_url = new_photo_path where id = owner_id;
  return jsonb_build_object('photo_path', new_photo_path);
end;
$$;

revoke all on function public.save_instructor_address(uuid, text) from public, anon;
revoke all on function public.save_instructor_profile_photo(uuid, text, text) from public, anon;
grant execute on function public.save_instructor_address(uuid, text) to authenticated;
grant execute on function public.save_instructor_profile_photo(uuid, text, text) to authenticated;

comment on column public.instructors.profile_picture_url is
  'Optional object path in the private instructor-photos bucket. Generate signed URLs at read time; never persist expiring URLs.';

commit;
