import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('admin preview protects locations and requires conflicts, verified employment and part-time slots', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.users(id uuid primary key, role text not null);
      create table public.instructors(id uuid primary key, user_id uuid, first_name text not null, last_name text not null,
        email text not null, employment_type text);
      create table public.instructor_private_details(instructor_id uuid primary key, address text);
      create table public.centres(id uuid primary key, address text not null, status text not null);
      create table public.events(id uuid primary key, centre_id uuid, instructor_id uuid, event_type text, status text,
        starts_at timestamptz, ends_at timestamptz);
      create table public.instructor_class_unavailability(id uuid primary key, event_id uuid, instructor_id uuid, status text);
      create table public.instructor_availability(instructor_id uuid, date date, start_time time, end_time time);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261108181922_class_cover_demo_locations.sql', import.meta.url), 'utf8'))
    await db.query("insert into public.users values ($1,'administrator'),($2,'instructor'),($3,'instructor'),($4,'instructor'),($5,'instructor'),($6,'instructor')", [id(1),id(2),id(3),id(4),id(5),id(6)])
    await db.query(`insert into public.instructors values
      ($1,$2,'Assigned','Owner','owner@example.test','full_time'),
      ($3,$4,'Available','Part-time','free@example.test','part_time'),
      ($5,$6,'Unknown','Employment','unknown@example.test',null),
      ($7,$8,'Far','Away','far@example.test','full_time'),
      ($9,$10,'Private','Address','private@example.test','full_time')`,
      [id(12),id(2),id(13),id(3),id(14),id(4),id(15),id(5),id(16),id(6)])
    await db.query("insert into public.centres values ($1,'Test dojo address','active')",[id(20)])
    await db.query("insert into public.events values ($1,$2,$3,'class','scheduled','2099-11-09 07:00:00+00','2099-11-09 08:00:00+00')",[id(21),id(20),id(12)])
    await db.query("insert into public.instructor_class_unavailability values ($1,$2,$3,'open')",[id(22),id(21),id(12)])
    await db.query("insert into public.centre_cover_geocodes(centre_id,address_snapshot,latitude,longitude) values ($1,'Test dojo address',1.34,103.77)",[id(20)])
    for (const [instructor,lat,lon] of [[13,1.341,103.771],[14,1.341,103.771],[15,1.43,103.85],[16,1.341,103.771]]) {
      await db.query("insert into public.instructor_cover_demo_locations(instructor_id,landmark,region,latitude,longitude) values ($1,'Public landmark','central',$2,$3)",[id(instructor),lat,lon])
    }
    await db.query("insert into public.instructor_private_details values ($1,'Never disclose this address')",[id(16)])
    await db.exec(`set request.jwt.claim.sub='${id(2)}'; set role authenticated;`)
    await assert.rejects(()=>db.query('select * from public.preview_class_cover_candidates($1)',[id(21)]),/Administrator access required/)
    await assert.rejects(()=>db.query('select * from public.instructor_cover_demo_locations'),/permission denied/)
    await db.exec(`reset role; set request.jwt.claim.sub='${id(1)}'; set role authenticated;`)
    const preview = async () => (await db.query('select * from public.preview_class_cover_candidates($1)',[id(21)])).rows
    let rows=await preview()
    assert.deepEqual(Object.keys(rows[0]).sort(),['distance_km','eligibility','instructor_id','instructor_name','location_basis'].sort())
    assert.equal(rows.find(x=>x.instructor_id===id(13)).eligibility,'no_positive_availability')
    assert.equal(rows.find(x=>x.instructor_id===id(14)).eligibility,'employment_unknown')
    assert.equal(rows.find(x=>x.instructor_id===id(15)).eligibility,'outside_5_km')
    assert.equal(rows.find(x=>x.instructor_id===id(16)).eligibility,'location_unverified')
    assert.equal(rows.find(x=>x.instructor_id===id(16)).distance_km,null)
    assert.ok(!JSON.stringify(rows).includes('Never disclose'))
    await db.exec('reset role')
    await db.query("insert into public.instructor_availability values ($1,'2099-11-09','15:00','16:00')",[id(13)])
    await db.exec('set role authenticated')
    rows=await preview()
    assert.equal(rows.find(x=>x.instructor_id===id(13)).eligibility,'demo_only_match')
    await db.exec('reset role')
    await db.query("insert into public.events values ($1,$2,$3,'class','scheduled','2099-11-09 07:30:00+00','2099-11-09 09:00:00+00')",[id(23),id(20),id(13)])
    await db.exec('set role authenticated')
    rows=await preview()
    assert.equal(rows.find(x=>x.instructor_id===id(13)).eligibility,'schedule_conflict')
    await db.exec('reset role')
    await db.query("update public.centres set address='Changed address' where id=$1",[id(20)])
    await db.exec('set role authenticated')
    rows=await preview()
    assert.ok(rows.every(x=>x.eligibility==='location_unverified'))
  } finally { await db.close() }
})

test('landmark seed skips existing private addresses and never overwrites them', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.instructors(id uuid primary key,email text not null);
      create table public.instructor_private_details(instructor_id uuid primary key,address text);
      create table public.centres(id uuid primary key,name text,address text);
      create table public.instructor_cover_demo_locations(instructor_id uuid primary key,landmark text,region text,
        latitude double precision,longitude double precision);
      create table public.centre_cover_geocodes(centre_id uuid primary key,address_snapshot text,
        latitude double precision,longitude double precision);
    `)
    await db.query("insert into public.instructors values ($1,'bobtan@gmail.com'),($2,'ananya.nair@example.test')",[id(1),id(2)])
    await db.query("insert into public.instructor_private_details values ($1,'Actual address: keep private')",[id(1)])
    await db.query("insert into public.centres values ($1,'Bukit Timah Dojo','Bukit Timah Community Club, 20 Toh Yi Dr, Singapore 596569')",[id(3)])
    const seed=await readFile(new URL('../supabase/migrations/20261108181934_class_cover_public_landmark_seed.sql', import.meta.url),'utf8')
    await db.exec(seed)
    const {rows:demo}=await db.query('select instructor_id,region from public.instructor_cover_demo_locations')
    assert.deepEqual(demo,[{instructor_id:id(2),region:'west'}])
    const {rows:privateRows}=await db.query('select address from public.instructor_private_details where instructor_id=$1',[id(1)])
    assert.equal(privateRows[0].address,'Actual address: keep private')
    const {rows:centre}=await db.query('select centre_id from public.centre_cover_geocodes')
    assert.deepEqual(centre,[{centre_id:id(3)}])
    await db.exec(seed)
    assert.equal((await db.query('select count(*)::integer as n from public.instructor_cover_demo_locations')).rows[0].n,1)
  } finally { await db.close() }
})
