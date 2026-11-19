-- Ordinary classes use explicitly labelled synthetic *approximate* locations
-- until instructors provide real ones. Never present these as home addresses.
-- The existing RPC names and invitation table are retained for compatibility.
begin;

-- Keep the synthetic provenance in the address/source rather than in is_demo.
update public.instructor_private_details
set address = 'Synthetic location: ' || landmark || ' (approximate, not a home address)',
    geocode_source = 'synthetic_public_landmark'
where is_demo and nullif(btrim(address), '') is null;

with missing as (
  select i.id, row_number() over (order by i.id) as slot
  from public.instructors i
  where not exists (select 1 from public.instructor_private_details p where p.instructor_id = i.id)
), landmarks as (
  select g.latitude, g.longitude, c.name,
    row_number() over (order by c.id) as slot,
    count(*) over () as total
  from public.centre_cover_geocodes g
  join public.centres c on c.id = g.centre_id
  where c.status = 'active' and c.address = g.address_snapshot
)
insert into public.instructor_private_details
  (instructor_id, address, landmark, region, latitude, longitude,
   geocode_source, is_demo, demo_location_created_at)
select m.id, 'Synthetic location: ' || g.name || ' (approximate, not a home address)',
  g.name, 'central', g.latitude, g.longitude,
  'synthetic_public_landmark', true, now()
from missing m join landmarks g on g.slot = 1 + ((m.slot - 1) % g.total);

-- Do not overwrite a real private address if one is added before deployment.
do $$ begin
  if exists (select 1 from public.instructor_private_details p
    where p.is_demo and (p.geocode_source <> 'synthetic_public_landmark'
      or p.address not like 'Synthetic location: % (approximate, not a home address)')) then
    raise exception 'Synthetic location conversion incomplete';
  end if;
end $$;

alter table public.instructor_private_details drop constraint complete_demo_location;
alter table public.instructor_private_details drop column is_demo;
comment on table public.instructor_private_details is
  'Private instructor data. geocode_source=synthetic_public_landmark and address starting Synthetic location: are approximate demo positions, not residences.';
comment on column public.instructor_private_details.address is
  'Synthetic location: ... entries are approximate demo positions, not an instructor residence.';

-- Rebuild the four existing security-definer RPCs without changing their
-- authorization, assignment locking, privacy projection or conflict checks.
-- Every replacement is asserted once so a future version cannot be silently
-- patched with different semantics.
do $migration$
declare
  fn text;
  body text;
  old_text text;
  new_text text;
  edits text[][];
  edit text[];
begin
  foreach fn in array array[
    'public.preview_class_cover_candidates(uuid)',
    'public.reserve_class_cover_test_invitation(uuid,uuid)',
    'public.get_class_cover_test_invitation(uuid)',
    'public.decide_class_cover_test_invitation(uuid,text)'
  ] loop
    body := pg_catalog.pg_get_functiondef(fn::regprocedure);
    if position('SECURITY DEFINER' in body) = 0 or position('SET search_path TO ''''' in body) = 0 then
      raise exception 'Unexpected cover function security settings: %', fn;
    end if;
    if fn = 'public.preview_class_cover_candidates(uuid)' then
      edits := array[
        array['selected.name <> ''[Cover Test] Weekday 3 PM''', 'false'],
        array['case when p.is_demo and nullif(btrim(p.address), '''') is null then p.latitude end',
          'case when p.geocode_source = ''synthetic_public_landmark'' and p.address like ''Synthetic location: % (approximate, not a home address)'' then p.latitude end'],
        array['case when p.is_demo and nullif(btrim(p.address), '''') is null then p.longitude end',
          'case when p.geocode_source = ''synthetic_public_landmark'' and p.address like ''Synthetic location: % (approximate, not a home address)'' then p.longitude end'],
        array['(nullif(btrim(p.address), '''') is not null) as has_private_address',
          '(p.geocode_source is distinct from ''synthetic_public_landmark'' or p.address not like ''Synthetic location: % (approximate, not a home address)'') as has_private_address'],
        array['''demo_only_match''', '''estimated_match''']
      ];
    elsif fn = 'public.reserve_class_cover_test_invitation(uuid,uuid)' then
      edits := array[
        array['selected.name <> ''[Cover Test] Weekday 3 PM''', 'false'],
        array['lower(candidate.email) !~ ''^[^@]+@example([.]test)?[.]com$''',
          'nullif(btrim(candidate.email), '''') is null'],
        array['p.eligibility=''demo_only_match''', 'p.eligibility=''estimated_match'''],
        array['Future test class needing cover required', 'Future class needing cover required'],
        array['Test recipient is not eligible', 'Instructor is not eligible']
      ];
    elsif fn = 'public.get_class_cover_test_invitation(uuid)' then
      edits := array[
        array['and lower(i.email) ~ ''^[^@]+@example([.]test)?[.]com$''', ''],
        array['and e.name = ''[Cover Test] Weekday 3 PM''', '']
      ];
    else
      edits := array[
        array['or selected.name <> ''[Cover Test] Weekday 3 PM''', ''],
        array['lower(candidate.email) !~ ''^[^@]+@example([.]test)?[.]com$''',
          'nullif(btrim(candidate.email), '''') is null'],
        array['location.is_demo is distinct from true',
          'location.geocode_source is distinct from ''synthetic_public_landmark'''],
        array['nullif(btrim(location.address), '''') is not null',
          'location.address not like ''Synthetic location: % (approximate, not a home address)'''],
        array['Test invitation unavailable', 'Invitation unavailable']
      ];
    end if;
    foreach edit slice 1 in array edits loop
      old_text := edit[1]; new_text := edit[2];
      if pg_catalog.length(body) - pg_catalog.length(pg_catalog.replace(body, old_text, ''))
        <> pg_catalog.length(old_text) then
        raise exception 'Unexpected cover function version: %, replacement %', fn, old_text;
      end if;
      body := pg_catalog.replace(body, old_text, new_text);
    end loop;
    execute body;
  end loop;
end;
$migration$;

comment on function public.preview_class_cover_candidates(uuid) is
  'Admin-only class cover shortlist. Distances use synthetic approximate locations, never verified homes.';

commit;
