import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('chat calendar filters other instructors before pagination without changing the shared calendar', async () => {
  const db = new PGlite()
  const [ben, peer, unlinked, student, benInstructor, peerInstructor, centre] = Array.from({ length: 7 }, (_, i) => id(i + 1))
  const [monday, tuesday, peerClass, peerGrading, ownGrading, laterGrading] = Array.from({ length: 6 }, (_, i) => id(i + 11))
  const start = '2026-11-16 00:00 Asia/Singapore'
  const end = '2026-11-23 00:00 Asia/Singapore'
  const sql = (query, params = []) => db.query(query, params)
  async function as(user, role, query, params = []) {
    await db.exec(`begin; set local role ${role};`)
    try {
      await sql("select set_config('request.jwt.claim.sub',$1,true)", [user ?? ''])
      await sql("select set_config('test.user_role',$1,true)", [user === student ? 'student' : 'instructor'])
      return (await sql(query, params)).rows
    } finally { await db.exec('rollback') }
  }
  const schedule = (user, pageSize = 20, pageOffset = 0) => as(user, 'authenticated',
    'select public.instructor_chat_schedule($1::timestamptz,$2::timestamptz,$3,$4) as result',
    [start, end, pageSize, pageOffset]).then(rows => rows[0].result)
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
      $$;
      create type public.user_role as enum ('student','instructor','administrator');
      create function public.current_user_role() returns public.user_role language sql stable as $$
        select nullif(current_setting('test.user_role', true),'')::public.user_role;
      $$;
      create table public.instructors(id uuid primary key,user_id uuid);
      create function public.current_instructor_id() returns uuid language sql stable as $$
        select id from public.instructors where user_id=auth.uid();
      $$;
      create function public.can_view_grading_schedule(uuid) returns boolean language sql stable as $$select false$$;
      create table public.centres(id uuid primary key,name text);
      create table public.events(id uuid primary key,name text,event_type text,instructor_id uuid,
        centre_id uuid,starts_at timestamptz,ends_at timestamptz,status text);
      create table public.gradings(event_id uuid primary key,grading_date date,
        schedule_published_at timestamptz,application_deadline date,application_status text,
        reporting_release_on date,reporting_time time);
      grant usage on schema auth,public to anon,authenticated;
      grant execute on all functions in schema auth,public to authenticated;
      grant select on all tables in schema public to authenticated;
      alter table public.events enable row level security;
      create policy readable_events on public.events for select to authenticated using (true);
    `)
    await sql('insert into public.instructors values($1,$2),($3,$4)', [benInstructor,ben,peerInstructor,peer])
    await sql("insert into public.centres values($1,'Bukit Timah Dojo')", [centre])
    await sql(`insert into public.events values
      ($1,'Monday class','class',$7,$9,'2026-11-16 19:00 Asia/Singapore','2026-11-16 20:00 Asia/Singapore','scheduled'),
      ($2,'Tuesday class','class',$7,$9,'2026-11-17 19:00 Asia/Singapore','2026-11-17 20:00 Asia/Singapore','scheduled'),
      ($3,'Peer class','class',$8,$9,'2026-11-19 19:00 Asia/Singapore','2026-11-19 20:00 Asia/Singapore','scheduled'),
      ($4,'Peer grading','grading',$8,$9,'2026-11-18 09:00 Asia/Singapore','2026-11-18 10:00 Asia/Singapore','scheduled'),
      ($5,'My date-only grading','grading',$7,$9,null,null,'scheduled'),
      ($6,'Later peer grading','grading',$8,$9,'2026-11-21 09:00 Asia/Singapore','2026-11-21 10:00 Asia/Singapore','scheduled')`,
      [monday,tuesday,peerClass,peerGrading,ownGrading,laterGrading,benInstructor,peerInstructor,centre])
    await sql("insert into public.gradings(event_id,grading_date,reporting_release_on,reporting_time) values ($1,'2026-11-18','2026-11-17','09:00'),($2,'2026-11-20','2099-01-01','10:00'),($3,'2026-11-21','2026-11-20','09:00')", [peerGrading,ownGrading,laterGrading])
    await db.exec(await readFile(new URL('../supabase/migrations/20261117120000_instructor_chat_schedule.sql', import.meta.url), 'utf8'))

    const all = await schedule(ben)
    assert.deepEqual(all.items.map(row => row.id), [monday,tuesday,ownGrading])
    assert.equal(all.total, 3)
    assert.equal(all.items[2].starts_at, null)
    assert.equal(all.items[2].grading.reporting_time, null)
    assert.equal(all.items[0].centre.name, 'Bukit Timah Dojo')
    assert.equal((await schedule(ben,1,0)).items[0].id, monday)
    assert.equal((await schedule(ben,1,1)).items[0].id, tuesday)
    assert.equal((await schedule(ben,1,2)).items[0].id, ownGrading)
    assert.equal((await schedule(ben,1,3)).items.length, 0)
    assert.equal((await schedule(ben,1,2)).total, 3)
    assert.deepEqual((await schedule(peer)).items.map(row => row.id), [peerGrading,peerClass,laterGrading])
    assert.deepEqual(await schedule(unlinked), { items: [], total: 0, offset: 0, limit: 20 })
    await assert.rejects(schedule(student), error => error.code === '42501')
    await assert.rejects(as(null,'anon','select public.instructor_chat_schedule($1::timestamptz,$2::timestamptz)',[start,end]),
      error => error.code === '42501')
    await assert.rejects(schedule(ben,0), error => error.code === '22023')
  } finally { await db.close() }
})
