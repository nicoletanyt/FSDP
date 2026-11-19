import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('demo attendance rebalance preserves eight at-risk students and leaves real and future results alone', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.students(id uuid primary key, email text not null);
      create table public.events(id uuid primary key, event_type text not null,
        status text not null, starts_at timestamptz not null, ends_at timestamptz not null);
      create table public.event_students(event_id uuid, student_id uuid,
        attendance_status text, checked_in_at timestamptz, primary key(event_id,student_id));
      insert into public.students
      select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        case when i <= 55 then 'synthetic.' || i || '@example.test'
          when i <= 81 then 'legacy.' || i || '@example.test'
          else 'real@example.com' end
      from generate_series(1,82) i;
      insert into public.events
      select ('00000000-0000-4000-8000-' || lpad((i*10+n)::text,12,'0'))::uuid,
        'class','completed',now() - n * interval '1 day',
        now() - n * interval '1 day' + interval '1 hour'
      from generate_series(1,82) i cross join generate_series(1,5) n;
      insert into public.event_students
      select ('00000000-0000-4000-8000-' || lpad((i*10+n)::text,12,'0'))::uuid,
        ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        case when n <= (case when i <= 13 or i between 56 and 68 then 5
          when i = 82 then 2 else 3 end) then 'absent' else 'present' end,
        null::timestamptz
      from generate_series(1,82) i cross join generate_series(1,5) n;
      insert into public.events values
        ('00000000-0000-4000-8000-000000009000','class','scheduled',
          now()+interval '1 day',now()+interval '1 day 1 hour');
      insert into public.event_students values
        ('00000000-0000-4000-8000-000000009000',
          '00000000-0000-4000-8000-000000000001',null,null);
    `)

    const seed = await readFile(new URL('../scripts/rebalance-demo-attendance-20261119.sql', import.meta.url), 'utf8')
    await db.exec(seed)
    const { rows: [result] } = await db.query(`
      with latest as (
        select s.id,s.email,es.attendance_status,e.id event_id,
          row_number() over(partition by s.id order by e.starts_at desc,e.id desc) rn
        from public.students s join public.event_students es on es.student_id=s.id
        join public.events e on e.id=es.event_id where e.ends_at<=now()
      ), flagged as (
        select id,max(email) email from latest where rn<=5 group by id
        having count(*) filter(where attendance_status='absent')>=3
      ) select
        (select count(*) from flagged) at_risk,
        (select count(*) from flagged where email like 'synthetic.%@example.test') synthetic_risk,
        (select count(*) from flagged where email like 'legacy.%@example.test') legacy_risk,
        (select count(*) from public.event_students where attendance_status='excused') excused,
        (select count(*) from public.event_students es join public.students s on s.id=es.student_id
          where s.email='real@example.com' and es.attendance_status='absent') real_absences,
        (select count(*) from public.event_students where event_id=
          '00000000-0000-4000-8000-000000009000' and attendance_status is null) future_bookings
    `)
    assert.equal(result.at_risk, 8)
    assert.equal(result.synthetic_risk, 4)
    assert.equal(result.legacy_risk, 4)
    assert.equal(result.excused, 109)
    assert.equal(result.real_absences, 2)
    assert.equal(result.future_bookings, 1)
    await assert.rejects(() => db.exec(seed), /Demo risk cohort changed/)
    await db.exec('rollback')
    assert.equal((await db.query("select count(*) excused from public.event_students where attendance_status='excused'" )).rows[0].excused, 109)
  } finally { await db.close() }
})
