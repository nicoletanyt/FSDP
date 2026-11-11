import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationsDir = new URL('../supabase/migrations/', import.meta.url)

test('student dashboard summary (offline PostgreSQL)', async (suite) => {
  const db = new PGlite()
  const ids = {
    adult: '00000000-0000-4000-8000-0000000000a1',
    child: '00000000-0000-4000-8000-0000000000a2',
    applicant: '00000000-0000-4000-8000-0000000000a3',
    instructor: '00000000-0000-4000-8000-0000000000a4',
  }

  async function summaryAs(role, userId) {
    await db.exec(`begin; set local role ${role};`)
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
      const { rows: [row] } = await db.query('select public.student_dashboard_summary() as summary')
      return row.summary
    } finally {
      await db.exec('rollback')
    }
  }

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
    `)
    // Base domain schema only; the grading-window rules are stubbed below so
    // this test covers the summary's own maths, not grading eligibility.
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && f <= '20261102041227_reset_and_domain_schema.sql')
      .sort()
    for (const file of files) await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'))

    await db.exec(`
      -- Added by 20261106062729_grading_fees.sql, which needs the full grading chain.
      alter table public.grade_requirements add column fee_cents integer;
      create table public.test_opportunities (user_id uuid, applied boolean);
      create function public.my_grading_opportunities() returns table(applied boolean)
        language sql stable as $$
          select applied from public.test_opportunities where user_id = auth.uid()
        $$;
    `)
    await db.exec(await readFile(new URL('20261111021425_student_dashboard_summary.sql', migrationsDir), 'utf8'))

    for (const [key, id] of Object.entries(ids)) {
      await db.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)',
        [id, `${key}@example.test`, key === 'instructor' ? '{"role":"instructor"}' : '{}'])
    }

    await db.exec(`
      insert into public.grades (id, label, colour, sort_order, is_ranked) values
        ('unranked', 'Unranked', null, 0, false),
        ('red-12th-kyu', 'Red (12th Kyu)', 'Red', 1, true),
        ('blue-6th-kyu', 'Blue (6th Kyu)', 'Blue', 7, true),
        ('blue-silver-6th-kyu', 'Blue-Silver (6th Kyu)', 'Blue-Silver', 8, true),
        ('blue-gold-5th-kyu', 'Blue-Gold (5th Kyu)', 'Blue-Gold', 9, true);
      insert into public.grade_tracks (grade_id, track) values
        ('red-12th-kyu', 'children'), ('blue-6th-kyu', 'adult'), ('blue-6th-kyu', 'children'),
        ('blue-silver-6th-kyu', 'children'), ('blue-gold-5th-kyu', 'adult'), ('blue-gold-5th-kyu', 'children');
      insert into public.grade_requirements (grade_id, track, min_months, min_sessions, min_age_years, fee_cents) values
        ('red-12th-kyu', 'children', 3, null, 5, 4500),
        ('blue-silver-6th-kyu', 'children', 6, null, null, 5000),
        ('blue-gold-5th-kyu', 'adult', 0, 24, null, 5500);
      insert into public.class_types (id, label, description) values ('adult-general', 'Adult General', 'All levels');
      insert into public.centres (id, name, short_name) values ('00000000-0000-4000-8000-0000000000c1', 'Bishan Dojo', 'BSH');
      insert into public.instructors (id, first_name, last_name, email)
        values ('00000000-0000-4000-8000-0000000000d1', 'Ken', 'Tan', 'ken@example.test');

      insert into public.students (id, user_id, member_no, first_name, last_name, email, home_centre_id,
        date_of_birth, joined_at, last_graded_at, current_grade_id, membership_status) values
        ('00000000-0000-4000-8000-0000000000b1', '${ids.adult}', 'M001', 'Jess', 'Tan', 'adult@example.test',
          '00000000-0000-4000-8000-0000000000c1', '1995-03-01',
          (now() at time zone 'Asia/Singapore')::date - interval '2 years',
          (now() at time zone 'Asia/Singapore')::date - interval '4 months', 'blue-6th-kyu', 'active'),
        ('00000000-0000-4000-8000-0000000000b2', '${ids.child}', 'M002', 'Kai', 'Lim', 'child@example.test',
          '00000000-0000-4000-8000-0000000000c1',
          make_date(extract(year from now() at time zone 'Asia/Singapore')::int - 8, 1, 1),
          (now() at time zone 'Asia/Singapore')::date - interval '1 year', null, 'blue-6th-kyu', 'active');
    `)

    // Adult's classes: two attended and one absence since last grading, one
    // attended before it, one upcoming booking and one cancelled future class.
    const classes = [
      ['e1', "now() - interval '6 months'", 'present'],
      ['e2', "now() - interval '2 months'", 'present'],
      ['e3', "now() - interval '1 month'", 'late'],
      ['e4', "now() - interval '2 weeks'", 'absent'],
      ['e5', "now() + interval '3 days'", null],
      ['e6', "now() + interval '1 day'", null, 'cancelled'],
      ['e7', "now() + interval '10 days'", null],
    ]
    for (const [key, at, attendance, status = 'scheduled'] of classes) {
      const eventId = `00000000-0000-4000-8000-0000000000${key}`
      await db.exec(`
        insert into public.events (id, event_type, centre_id, instructor_id, name, starts_at, ends_at, status)
          values ('${eventId}', 'class', '00000000-0000-4000-8000-0000000000c1',
            '00000000-0000-4000-8000-0000000000d1', 'Class ${key}', ${at}, ${at} + interval '1 hour', '${status}');
        insert into public.classes (event_id, class_type_id) values ('${eventId}', 'adult-general');
        insert into public.event_students (event_id, student_id, attendance_status)
          values ('${eventId}', '00000000-0000-4000-8000-0000000000b1', ${attendance ? `'${attendance}'` : 'null'});
      `)
    }
    await db.query('insert into public.test_opportunities values ($1, false)', [ids.adult])

    await suite.test('adult member gets belt, progress, attendance, bookings and next class', async () => {
      const s = await summaryAs('authenticated', ids.adult)
      assert.equal(s.linked, true)
      assert.equal(s.membership_status, 'active')
      assert.equal(s.track, 'adult')
      assert.deepEqual(s.belt, { id: 'blue-6th-kyu', label: 'Blue (6th Kyu)', colour: 'Blue' })
      // Children-only Blue-Silver is skipped on the adult track.
      assert.deepEqual(s.next_belt, { id: 'blue-gold-5th-kyu', label: 'Blue-Gold (5th Kyu)', colour: 'Blue-Gold' })
      assert.deepEqual(s.requirements, {
        sessions_done: 2, sessions_required: 24, months_done: 4, months_required: 0,
        min_age_years: null, fee_cents: 5500, fee_paid: false,
      })
      assert.deepEqual(s.counts, { classes_booked: 2, sessions_marked: 4, sessions_attended: 3, gradings_open: 1 })
      assert.equal(s.next_class.title, 'Adult General')
      assert.equal(s.next_class.centre, 'Bishan Dojo')
      assert.equal(s.next_class.instructor, 'Ken Tan')
      assert.ok(Date.parse(s.next_class.starts_at) > Date.now() + 2 * 86_400_000, 'skips the cancelled class')
    })

    await suite.test('a paid application marks the fee paid and clears the open count', async () => {
      await db.query('update public.test_opportunities set applied = true where user_id = $1', [ids.adult])
      const s = await summaryAs('authenticated', ids.adult)
      assert.equal(s.requirements.fee_paid, true)
      assert.equal(s.counts.gradings_open, 0)
    })

    await suite.test('a child follows the children track and counts months since joining', async () => {
      const s = await summaryAs('authenticated', ids.child)
      assert.equal(s.track, 'children')
      assert.equal(s.next_belt.id, 'blue-silver-6th-kyu')
      assert.equal(s.requirements.sessions_required, null)
      assert.equal(s.requirements.months_required, 6)
      assert.equal(s.requirements.months_done, 12)
      assert.equal(s.next_class, null)
      assert.deepEqual(s.counts, { classes_booked: 0, sessions_marked: 0, sessions_attended: 0, gradings_open: 0 })
    })

    await suite.test('accounts without a student record, and instructors, are not linked', async () => {
      assert.deepEqual(await summaryAs('authenticated', ids.applicant), { linked: false })
      assert.deepEqual(await summaryAs('authenticated', ids.instructor), { linked: false })
    })

    await suite.test('signed-out visitors cannot call it', async () => {
      await assert.rejects(summaryAs('anon', null), /permission denied/)
    })
  } finally {
    await db.close()
  }
})
