import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('admin attendance monitoring aggregates completed bookings and scopes students securely', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users(id uuid primary key, role text);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      create table public.centres(id uuid primary key, name text);
      create table public.grades(id text primary key, label text);
      create table public.students(id uuid primary key,first_name text,last_name text,member_no text,email text,
        home_centre_id uuid,joined_at date,follow_up_status text,current_grade_id text);
      create table public.events(id uuid primary key,event_type text,centre_id uuid,status text,
        starts_at timestamptz,ends_at timestamptz);
      create table public.event_students(event_id uuid,student_id uuid,attendance_status text);
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid(),public.is_administrator() to authenticated;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261111020428_admin_attendance_monitoring.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261111022553_monitor_recent_enrolments.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261111103400_attendance_three_risk_levels.sql', import.meta.url), 'utf8'))
    await db.query("insert into public.users values ($1,'administrator'),($2,'student')",[id(1),id(2)])
    await db.query("insert into public.centres values ($1,'One'),($2,'Two')",[id(20),id(21)])
    await db.exec("insert into public.grades values ('unranked','Unranked')")
    await db.query(`insert into public.students values
      ($1,'Alice','No bookings','A','a@example.com',$4,(now() at time zone 'Asia/Singapore')::date-40,'none','unranked'),
      ($2,'Bob','Missed','B','b@example.com',$4,(now() at time zone 'Asia/Singapore')::date-40,'flagged','unranked'),
      ($3,'Carol','Other','C','c@example.com',$5,(now() at time zone 'Asia/Singapore')::date-40,'resolved','unranked'),
      ('${id(13)}','Drew','Two missed','D','d@example.com',$4,(now() at time zone 'Asia/Singapore')::date-40,'none','unranked'),
      ('${id(14)}','Ellis','Unknown','E','e@example.com',$4,(now() at time zone 'Asia/Singapore')::date-40,'none','unranked'),
      ('${id(15)}','Fran','Four missed','F','f@example.com',$4,(now() at time zone 'Asia/Singapore')::date-40,'none','unranked')`,
      [id(10),id(11),id(12),id(20),id(21)])
    for (let n=0; n<5; n++) {
      await db.query(`insert into public.events values ($1,'class',$2,'scheduled',
        (((now() at time zone 'Asia/Singapore')::date-$3::integer)+time '10:00') at time zone 'Asia/Singapore',
        (((now() at time zone 'Asia/Singapore')::date-$3::integer)+time '11:00') at time zone 'Asia/Singapore')`,[id(30+n),id(20),n+1])
      await db.query("insert into public.event_students values ($1,$2,'absent')",[id(30+n),id(11)])
      await db.query('insert into public.event_students values ($1,$2,$3)',[id(30+n),id(13),n < 2 ? 'absent' : 'present'])
      await db.query('insert into public.event_students values ($1,$2,$3)',[id(30+n),id(14),n < 2 ? 'excused' : null])
      await db.query('insert into public.event_students values ($1,$2,$3)',[id(30+n),id(15),n < 4 ? 'absent' : 'late'])
    }
    // An older result and a future enrolment must not change the last-five sample.
    await db.query(`insert into public.events values ($1,'class',$2,'scheduled',
      (((now() at time zone 'Asia/Singapore')::date-60)+time '10:00') at time zone 'Asia/Singapore',
      (((now() at time zone 'Asia/Singapore')::date-60)+time '11:00') at time zone 'Asia/Singapore')`,[id(42),id(20)])
    await db.query("insert into public.event_students values ($1,$2,'present')",[id(42),id(11)])
    await db.query(`insert into public.events values ($1,'class',$2,'scheduled',
      (((now() at time zone 'Asia/Singapore')::date+2)+time '10:00') at time zone 'Asia/Singapore',
      (((now() at time zone 'Asia/Singapore')::date+2)+time '11:00') at time zone 'Asia/Singapore')`,[id(40),id(20)])
    await db.query("insert into public.event_students values ($1,$2,null)",[id(40),id(11)])
    await db.query(`insert into public.events values ($1,'class',$2,'scheduled',
      (((now() at time zone 'Asia/Singapore')::date-1)+time '10:00') at time zone 'Asia/Singapore',
      (((now() at time zone 'Asia/Singapore')::date-1)+time '11:00') at time zone 'Asia/Singapore')`,[id(41),id(21)])
    await db.query("insert into public.event_students values ($1,$2,'present')",[id(41),id(12)])

    assert.equal((await db.query("select has_function_privilege('anon','public.admin_attendance_monitoring(uuid)','EXECUTE') as allowed")).rows[0].allowed,false)
    await db.exec(`set request.jwt.claim.sub='${id(2)}'; set role authenticated`)
    await assert.rejects(() => db.query('select public.admin_attendance_monitoring()'),/Administrator access required/)
    await db.exec(`reset role; set request.jwt.claim.sub='${id(1)}'; set role authenticated`)
    const rows = (await db.query('select public.admin_attendance_monitoring() as result')).rows[0].result
    assert.equal(rows.length, 6)
    assert.equal(rows[0].first_name, 'Bob')
    assert.equal(rows[0].level, 'at_risk')
    assert.equal(rows[0].missed, 5)
    assert.equal(rows[0].enrolments, 5)
    assert.equal(rows[0].rate, 0)
    assert.equal(rows[0].follow_up_status, 'flagged')
    const alice = rows.find(row => row.first_name === 'Alice')
    assert.equal(alice.level, 'unassessed')
    assert.equal(alice.rate, null)
    assert.equal(rows.find(row => row.first_name === 'Drew').level, 'at_risk')
    assert.equal(rows.find(row => row.first_name === 'Drew').rate, 60)
    assert.equal(rows.find(row => row.first_name === 'Fran').level, 'at_risk')
    assert.equal(rows.find(row => row.first_name === 'Fran').rate, 20)
    assert.equal(rows.find(row => row.first_name === 'Ellis').level, 'unassessed')
    assert.equal(rows.find(row => row.first_name === 'Carol').last_attended !== null, true)
    const scoped = (await db.query('select public.admin_attendance_monitoring($1) as result',[id(20)])).rows[0].result
    assert.equal(scoped.length, 5)
    await assert.rejects(() => db.query('select public.admin_attendance_monitoring($1)',[id(99)]),/Centre not found/)
  } finally { await db.close() }
})
