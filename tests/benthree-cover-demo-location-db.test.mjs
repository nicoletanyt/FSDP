import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const seed = await readFile(new URL('../supabase/migrations/20261109041933_benthree_cover_demo_location.sql', import.meta.url), 'utf8')

test('Bent Three receives only a synthetic landmark, with existing/private locations preserved', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.users(id integer primary key, role text not null);
      create table public.instructors(id integer primary key, user_id integer, email text not null, employment_type text);
      create table public.instructor_private_details(instructor_id integer primary key, address text);
      create table public.instructor_cover_demo_locations(instructor_id integer primary key, landmark text, region text,
        latitude double precision, longitude double precision, geocode_source text, is_demo boolean default true);
      insert into public.users values (1,'instructor');
      insert into public.instructors values
        (2,1,'bentwo@example.com','part_time'),(3,1,'benthree@example.com','part_time');
      insert into public.instructor_cover_demo_locations values
        (2,'Beauty World Centre','central',1.342359,103.7764335,'OpenStreetMap contributors / Nominatim',true);
    `)
    await db.exec(seed)
    await db.exec(seed)
    const { rows } = await db.query('select landmark,region,latitude,longitude,is_demo from public.instructor_cover_demo_locations where instructor_id=3')
    assert.deepEqual(rows, [{ landmark:'Beauty World Centre',region:'central',latitude:1.342359,longitude:103.7764335,is_demo:true }])
    await db.exec(`delete from public.instructor_cover_demo_locations where instructor_id=3;
      insert into public.instructor_private_details values (3,'Existing private address');`)
    await db.exec(seed)
    assert.equal((await db.query('select count(*)::integer as total from public.instructor_cover_demo_locations where instructor_id=3')).rows[0].total,0)
    assert.equal((await db.query('select address from public.instructor_private_details where instructor_id=3')).rows[0].address,'Existing private address')
  } finally { await db.close() }
})
