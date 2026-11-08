import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('only an invited linked instructor can decide; first valid acceptance wins and decline leaves request open', async () => {
  const db = new PGlite()
  const as = async user => db.exec(`reset role; set request.jwt.claim.sub='${id(user)}'; set role authenticated;`)
  const get = invitation => db.query('select public.get_class_cover_test_invitation($1) as detail',[id(invitation)])
  const decide = (invitation,response) => db.query('select public.decide_class_cover_test_invitation($1,$2) as result',[id(invitation),response])
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users(id uuid primary key,role text not null);
      create table public.instructors(id uuid primary key,user_id uuid,first_name text,last_name text,email text,employment_type text);
      create table public.instructor_private_details(instructor_id uuid primary key,address text);
      create table public.centres(id uuid primary key,name text,address text,status text);
      create table public.events(id uuid primary key,centre_id uuid,instructor_id uuid,event_type text,status text,
        name text,starts_at timestamptz,ends_at timestamptz);
      create table public.instructor_class_unavailability(id uuid primary key,event_id uuid unique,instructor_id uuid,status text);
      create table public.instructor_availability(instructor_id uuid,date date,start_time time,end_time time);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;
    `)
    for (const file of ['20261108181922_class_cover_demo_locations.sql','20261108190452_class_cover_test_invitations.sql','20261108192742_class_cover_test_decisions.sql'])
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
    await db.query(`insert into public.users values ($1,'administrator'),($2,'instructor'),($3,'instructor'),($4,'instructor'),($5,'instructor')`,[id(1),id(2),id(3),id(4),id(5)])
    for (const [n,u,email,employment] of [[10,2,'benone@example.com','full_time'],[11,3,'bentwo@example.com','part_time'],[12,4,'benthree@example.com','full_time'],[13,5,'stranger@gmail.com','full_time']])
      await db.query('insert into public.instructors values ($1,$2,$3,$4,$5,$6)',[id(n),id(u),'Ben',String(n),email,employment])
    await db.query("insert into public.centres values ($1,'Bukit Timah Dojo','Demo centre','active')",[id(20)])
    await db.query("insert into public.events values ($1,$2,$3,'class','scheduled','[Cover Test] Weekday 3 PM',now()+interval '1 day',now()+interval '1 day 1 hour')",[id(21),id(20),id(10)])
    await db.query("insert into public.instructor_class_unavailability values ($1,$2,$3,'open')",[id(22),id(21),id(10)])
    await db.query("insert into public.centre_cover_geocodes(centre_id,address_snapshot,latitude,longitude) values ($1,'Demo centre',1.34,103.77)",[id(20)])
    for (const n of [11,12]) await db.query("insert into public.instructor_cover_demo_locations(instructor_id,landmark,region,latitude,longitude) values ($1,'Public test location','central',1.341,103.771)",[id(n)])
    // Cover the future SGT time, independent of the CI host timezone.
    await db.query("insert into public.instructor_availability select $1,(starts_at at time zone 'Asia/Singapore')::date,'00:00'::time,'23:59'::time from public.events where id=$2",[id(11),id(21)])
    for (const [n,instructor,status] of [[31,11,'accepted'],[32,12,'accepted'],[33,13,'accepted']])
      await db.query('insert into public.class_cover_test_invitations(id,event_id,instructor_id,requested_by,status) values ($1,$2,$3,$4,$5)',[id(n),id(21),id(instructor),id(1),status])

    await as(1)
    await assert.rejects(()=>get(31),/Instructor access required/)
    await assert.rejects(()=>decide(31,'accept'),/Instructor access required/)
    await as(5)
    assert.equal((await get(31)).rows[0].detail,null)
    await assert.rejects(()=>decide(31,'accept'),/not found for this account/)
    await as(3)
    assert.equal((await get(31)).rows[0].detail.state,'open')
    await assert.rejects(()=>decide(31,'invalid'),/Invalid response/)
    // Withdrawal of the positive availability blocks acceptance, without
    // consuming the invitation. Declining remains possible and leaves cover open.
    await db.exec('reset role')
    await db.query('delete from public.instructor_availability where instructor_id=$1',[id(11)])
    await as(3)
    assert.equal((await decide(31,'accept')).rows[0].result,'ineligible')
    assert.equal((await decide(31,'decline')).rows[0].result,'declined')
    assert.equal((await decide(31,'decline')).rows[0].result,'declined')
    assert.equal((await decide(31,'accept')).rows[0].result,'declined')
    await db.exec('reset role')
    assert.equal((await db.query('select status from public.instructor_class_unavailability where id=$1',[id(22)])).rows[0].status,'open')
    await as(4)
    // Location and schedule must still be valid when accepting, not just at send time.
    await db.exec('reset role')
    await db.query('insert into public.instructor_private_details values ($1,$2)',[id(12),'A private address'])
    await as(4)
    assert.equal((await decide(32,'accept')).rows[0].result,'ineligible')
    await db.exec('reset role')
    await db.query('delete from public.instructor_private_details where instructor_id=$1',[id(12)])
    await db.query("insert into public.events values ($1,$2,$3,'class','scheduled','Conflicting class',now()+interval '1 day',now()+interval '1 day 1 hour')",[id(23),id(20),id(12)])
    await as(4)
    assert.equal((await decide(32,'accept')).rows[0].result,'ineligible')
    await db.exec('reset role')
    await db.query('delete from public.events where id=$1',[id(23)])
    await as(4)
    // Two overlapping attempts on the same invitation cannot assign twice.
    assert.deepEqual((await Promise.all([decide(32,'accept'),decide(32,'accept')])).map(x=>x.rows[0].result),['accepted','accepted'])
    assert.equal((await decide(32,'accept')).rows[0].result,'accepted')
    assert.equal((await get(32)).rows[0].detail.state,'accepted')
    await as(3)
    assert.equal((await decide(31,'accept')).rows[0].result,'declined')
    await as(4)
    assert.equal((await get(31)).rows[0].detail,null)
    await db.exec('reset role')
    assert.equal((await db.query('select instructor_id from public.events where id=$1',[id(21)])).rows[0].instructor_id,id(12))
    assert.equal((await db.query('select status from public.instructor_class_unavailability where id=$1',[id(22)])).rows[0].status,'covered')
    assert.deepEqual((await db.query("select decision from public.class_cover_test_invitations where event_id=$1 order by id",[id(21)])).rows.map(x=>x.decision),['declined','accepted','pending'])
    // A second non-declined invite can no longer accept this class.
    await db.query('update public.instructors set email=$1 where id=$2',['benfour@example.com',id(13)])
    await as(5)
    assert.equal((await decide(33,'accept')).rows[0].result,'covered')
    assert.equal((await get(33)).rows[0].detail.state,'covered')
    await db.exec('reset role')
    await db.query("insert into public.events values ($1,$2,$3,'class','scheduled','[Cover Test] Weekday 3 PM',now()+interval '2 days',now()+interval '2 days 1 hour')",[id(24),id(20),id(10)])
    await db.query("insert into public.instructor_class_unavailability values ($1,$2,$3,'open')",[id(25),id(24),id(10)])
    await db.query("insert into public.class_cover_test_invitations(id,event_id,instructor_id,requested_by,status) values ($1,$2,$3,$4,'failed')",[id(35),id(24),id(11),id(1)])
    await as(3)
    assert.equal((await get(35)).rows[0].detail.state,'not_sent')
    assert.equal((await decide(35,'accept')).rows[0].result,'not_sent')
  } finally { await db.close() }
})
