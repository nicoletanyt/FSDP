import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('test invitation reservation is admin-only, rechecks eligibility and never duplicates', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users(id uuid primary key,role text not null);
      create table public.instructors(id uuid primary key,user_id uuid,first_name text,last_name text,email text,employment_type text);
      create table public.instructor_private_details(instructor_id uuid primary key,address text);
      create table public.centres(id uuid primary key,address text,status text);
      create table public.events(id uuid primary key,centre_id uuid,instructor_id uuid,event_type text,status text,
        name text,starts_at timestamptz,ends_at timestamptz);
      create table public.instructor_class_unavailability(id uuid primary key,event_id uuid,instructor_id uuid,status text);
      create table public.instructor_availability(instructor_id uuid,date date,start_time time,end_time time);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;
    `)
    for (const file of ['20261108181922_class_cover_demo_locations.sql','20261108190452_class_cover_test_invitations.sql'])
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
    await db.query("insert into public.users values ($1,'administrator'),($2,'instructor'),($3,'instructor'),($4,'instructor')",[id(1),id(2),id(3),id(4)])
    await db.query("insert into public.instructors values ($1,$2,'Original','Teacher','benone@example.com','full_time'),($3,$4,'Test','Candidate','bentwo@example.com','full_time'),($5,$6,'Other','Person','other@gmail.com','full_time')",[id(10),id(2),id(11),id(3),id(12),id(4)])
    await db.query("insert into public.centres values ($1,'Demo centre','active')",[id(20)])
    await db.query("insert into public.events values ($1,$2,$3,'class','scheduled','[Cover Test] Weekday 3 PM',now()+interval '1 day',now()+interval '1 day 1 hour')",[id(21),id(20),id(10)])
    await db.query("insert into public.instructor_class_unavailability values ($1,$2,$3,'open')",[id(22),id(21),id(10)])
    await db.query("insert into public.centre_cover_geocodes(centre_id,address_snapshot,latitude,longitude) values ($1,'Demo centre',1.34,103.77)",[id(20)])
    await db.query("insert into public.instructor_cover_demo_locations(instructor_id,landmark,region,latitude,longitude) values ($1,'Public test location','central',1.341,103.771),($2,'Public test location','central',1.341,103.771)",[id(11),id(12)])
    await db.exec(`set request.jwt.claim.sub='${id(3)}'; set role authenticated;`)
    await assert.rejects(()=>db.query('select public.reserve_class_cover_test_invitation($1,$2)',[id(21),id(11)]),/Administrator access required/)
    assert.deepEqual((await db.query('select * from public.class_cover_test_invitations')).rows,[])
    await db.exec(`reset role; set request.jwt.claim.sub='${id(1)}'; set role authenticated;`)
    await assert.rejects(()=>db.query('select public.reserve_class_cover_test_invitation($1,$2)',[id(21),id(12)]),/not eligible/)
    const {rows}=await db.query('select public.reserve_class_cover_test_invitation($1,$2) as id',[id(21),id(11)])
    assert.ok(rows[0].id)
    await assert.rejects(()=>db.query('select public.reserve_class_cover_test_invitation($1,$2)',[id(21),id(11)]),/already recorded/)
    await assert.rejects(()=>db.query('update public.class_cover_test_invitations set status=$1',["accepted"]),/permission denied/)
    assert.equal((await db.query('select status from public.class_cover_test_invitations')).rows[0].status,'sending')
  } finally { await db.close() }
})
