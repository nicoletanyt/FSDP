import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const migration = new URL('../supabase/migrations/', import.meta.url)

test('test landmarks migrate privately; linked full-time Ben Ten can accept without a positive slot', async () => {
  const db = new PGlite()
  const as = async user => db.exec(`reset role; set request.jwt.claim.sub='${id(user)}'; set role authenticated;`)
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
      create table public.instructor_class_unavailability(id uuid primary key,event_id uuid,instructor_id uuid,status text);
      create table public.instructor_availability(instructor_id uuid,date date,start_time time,end_time time);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;
    `)
    for (const file of ['20261108181922_class_cover_demo_locations.sql','20261108190452_class_cover_test_invitations.sql','20261108192742_class_cover_test_decisions.sql'])
      await db.exec(await readFile(new URL(file,migration),'utf8'))
    await db.query("insert into public.users values ($1,'administrator'),($2,'instructor'),($3,'instructor'),($4,'instructor')",[id(1),id(2),id(3),id(4)])
    await db.query("insert into public.instructors values ($1,$2,'Ben','One','benone@example.com','full_time'),($3,$4,'Ben','Two','bentwo@example.com','part_time'),($5,$6,'Ben','Ten','benten@example.test.com','full_time')",
      [id(10),id(2),id(11),id(3),id(12),id(4)])
    for (let n=20; n<29; n++)
      await db.query('insert into public.instructors values ($1,null,$2,$3,$4,null)',[id(n),'Test',String(n),`test${n}@example.com`])
    await db.query("insert into public.instructor_private_details values ($1,'Existing private address')",[id(12)])
    await db.query("insert into public.centres values ($1,'Bukit Timah Dojo','Demo centre','active')",[id(30)])
    await db.query("insert into public.events values ($1,$2,$3,'class','scheduled','[Cover Test] Weekday 3 PM',now()+interval '1 day',now()+interval '1 day 1 hour')",[id(31),id(30),id(10)])
    await db.query("insert into public.instructor_class_unavailability values ($1,$2,$3,'open')",[id(32),id(31),id(10)])
    await db.query("insert into public.centre_cover_geocodes(centre_id,address_snapshot,latitude,longitude) values ($1,'Demo centre',1.34,103.77)",[id(30)])
    for (const n of [11, ...Array.from({length:9},(_,index)=>index+20)])
      await db.query("insert into public.instructor_cover_demo_locations(instructor_id,landmark,region,latitude,longitude) values ($1,'Beauty World Centre','central',1.341,103.771)",[id(n)])
    await db.exec(await readFile(new URL('20261109045355_consolidate_test_cover_locations.sql',migration),'utf8'))
    await db.exec(await readFile(new URL('20261109051434_cover_invitation_covered_status.sql',migration),'utf8'))

    assert.equal((await db.query('select count(*)::integer as total from public.instructor_private_details where is_demo')).rows[0].total,11)
    assert.equal((await db.query('select to_regclass($1) as old',['public.instructor_cover_demo_locations'])).rows[0].old,null)
    const {rows:[benTen]}=await db.query('select address,landmark,latitude,longitude,is_demo from public.instructor_private_details where instructor_id=$1',[id(12)])
    assert.deepEqual(benTen,{address:null,landmark:'Beauty World Centre',latitude:1.341,longitude:103.771,is_demo:true})
    assert.equal((await db.query('select count(*)::integer as total from public.instructor_availability')).rows[0].total,0)

    await as(4)
    await assert.rejects(()=>db.query('select * from public.preview_class_cover_candidates($1)',[id(31)]),/Administrator access required/)
    await as(1)
    const {rows}=await db.query('select * from public.preview_class_cover_candidates($1)',[id(31)])
    for (const n of [11,12]) {
      const candidate=rows.find(x=>x.instructor_id===id(n))
      assert.equal(candidate?.eligibility,n===11 ? 'no_positive_availability' : 'demo_only_match')
      assert.equal(candidate?.location_basis,'synthetic_public_landmark')
    }
    assert.ok(!JSON.stringify(rows).includes('Existing private address'))
    const {rows:[invitation]}=await db.query('select public.reserve_class_cover_test_invitation($1,$2) as id',[id(31),id(12)])
    await db.exec('reset role')
    await db.query("update public.class_cover_test_invitations set status='accepted' where id=$1",[invitation.id])
    await as(4)
    assert.equal((await db.query('select public.get_class_cover_test_invitation($1) as detail',[invitation.id])).rows[0].detail.state,'open')
    await db.exec('reset role')
    await db.query('update public.instructor_private_details set address=$1 where instructor_id=$2',['New private address',id(12)])
    await as(4)
    assert.equal((await db.query("select public.decide_class_cover_test_invitation($1,'accept') as outcome",[invitation.id])).rows[0].outcome,'ineligible')
    await db.exec('reset role')
    await db.query('update public.instructor_private_details set address=null,is_demo=false where instructor_id=$1',[id(12)])
    await as(4)
    assert.equal((await db.query("select public.decide_class_cover_test_invitation($1,'accept') as outcome",[invitation.id])).rows[0].outcome,'ineligible')
    await db.exec('reset role')
    await db.query('update public.instructor_private_details set is_demo=true where instructor_id=$1',[id(12)])
    await as(4)
    assert.equal((await db.query("select public.decide_class_cover_test_invitation($1,'accept') as outcome",[invitation.id])).rows[0].outcome,'accepted')
    await db.exec('reset role')
    assert.equal((await db.query('select instructor_id from public.events where id=$1',[id(31)])).rows[0].instructor_id,id(12))
    assert.equal((await db.query('select status from public.instructor_class_unavailability where event_id=$1',[id(31)])).rows[0].status,'covered')
  } finally { await db.close() }
})
