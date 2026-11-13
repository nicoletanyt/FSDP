import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('bentwo test location reuses public cached coordinates without replacing private data', async () => {
  const db = new PGlite()
  const migration = await readFile(new URL('../supabase/migrations/20261108183130_bentwo_cover_demo_location.sql', import.meta.url), 'utf8')
  try {
    await db.exec(`
      create table public.users(id integer primary key, role text not null);
      create table public.instructors(id integer primary key, user_id integer, email text not null, employment_type text);
      create table public.instructor_private_details(instructor_id integer primary key, address text);
      create table public.instructor_cover_demo_locations(instructor_id integer primary key, landmark text, region text,
        latitude double precision, longitude double precision, geocode_source text, is_demo boolean default true);
      insert into public.users values (1,'instructor');
      insert into public.instructors values (1,null,'bobtan@gmail.com',null),(2,1,'bentwo@example.com','part_time');
      insert into public.instructor_cover_demo_locations values
        (1,'Beauty World Centre','central',1.342359,103.7764335,'OpenStreetMap contributors / Nominatim',true);
    `)
    await db.exec(migration)
    await db.exec(migration)
    const { rows } = await db.query('select landmark,latitude,longitude from public.instructor_cover_demo_locations where instructor_id=2')
    assert.deepEqual(rows, [{landmark:'Beauty World Centre',latitude:1.342359,longitude:103.7764335}])
    await db.exec(`delete from public.instructor_cover_demo_locations where instructor_id=2;
      insert into public.instructor_private_details values (2,'Existing private address');`)
    await db.exec(migration)
    assert.equal((await db.query('select count(*)::integer as count from public.instructor_cover_demo_locations where instructor_id=2')).rows[0].count,0)
    assert.equal((await db.query('select address from public.instructor_private_details where instructor_id=2')).rows[0].address,'Existing private address')
  } finally { await db.close() }
})
