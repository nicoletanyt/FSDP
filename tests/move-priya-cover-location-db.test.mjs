import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('move only Priya’s synthetic cover location to Jamie’s Bishan landmark', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.instructors (id integer primary key, first_name text, last_name text,
        employment_type text, user_id integer);
      create table public.instructor_private_details (instructor_id integer primary key,
        address text, landmark text, region text, latitude double precision,
        longitude double precision, geocode_source text);
      insert into public.instructors values
        (1,'Priya','Rao','part_time',1),
        (2,'Jamie','Chen','part_time',null),
        (3,'Daniel','Koh','full_time',3);
      insert into public.instructor_private_details values
        (1,'Synthetic location: Bukit Timah Dojo (approximate, not a home address)',
          'Bukit Timah Dojo','central',1.3404934,103.7717548,'synthetic_public_landmark'),
        (2,'Synthetic location: Bishan Community Centre (approximate, not a home address)',
          'Bishan Community Centre','central',1.349754,103.8507936,'synthetic_public_landmark'),
        (3,'Synthetic location: Bukit Timah Dojo (approximate, not a home address)',
          'Bukit Timah Dojo','central',1.3404934,103.7717548,'synthetic_public_landmark');
    `)
    const move = await readFile(new URL('../scripts/move-priya-cover-location-to-bishan-20261119.sql', import.meta.url), 'utf8')
    await db.exec(move)
    const { rows } = await db.query('select instructor_id,address,landmark,latitude,longitude from public.instructor_private_details order by instructor_id')
    assert.equal(rows[0].landmark, 'Bishan Community Centre')
    assert.equal(rows[0].address, rows[1].address)
    assert.equal(rows[0].latitude, rows[1].latitude)
    assert.equal(rows[0].longitude, rows[1].longitude)
    assert.equal(rows[2].landmark, 'Bukit Timah Dojo')
    await assert.rejects(() => db.exec(move), /Expected exactly one synthetic instructor location to move/)
    await db.exec('rollback')
    assert.equal((await db.query('select landmark from public.instructor_private_details where instructor_id=1')).rows[0].landmark, 'Bishan Community Centre')
  } finally { await db.close() }
})
