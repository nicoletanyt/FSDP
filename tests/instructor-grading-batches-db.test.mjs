import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [a,b,studentUser,unlinked,admin] = [1,2,3,4,5].map(uuid)
const [ia,ib,centre,student,peer,event,otherEvent] = [11,12,20,31,32,100,101].map(uuid)
const signature = { version: 1, strokes: [[{ x: 0.2, y: 0.4 }, { x: 0.6, y: 0.8 }]] }
const cells = [student,peer].flatMap(student_id => ['one','two'].map(syllabus_item_id => ({ student_id, syllabus_item_id, checked: true })))

test('instructor grading batches (offline PostgreSQL)', async suite => {
  const db = new PGlite()
  const sql = (text,args=[]) => db.query(text,args)
  async function as(user, run) {
    await db.exec('begin; set local role authenticated;')
    try {
      await sql("select set_config('request.jwt.claim.sub',$1,true)",[user])
      const result = await run()
      await db.exec('commit')
      return result
    } catch (error) { await db.exec('rollback'); throw error }
  }
  let sequence = 200
  const save = (user,version,values=cells,submit=false,sig=null,id=uuid(sequence++),grade='target') => as(user, async () => (await sql(
    'select public.save_instructor_grading_batch($1,$2,$3,$4,$5,$6,$7,$8,$9) as data',
    [id,user,event,'adult',grade,version,JSON.stringify(values),submit,sig===null?null:JSON.stringify(sig)]
  )).rows[0].data)
  const get = user => as(user, async () => (await sql("select public.get_instructor_grading_batch($1,'adult','target') as data",[event])).rows[0].data)
  const latest = user => as(user, async () => (await sql('select public.get_latest_instructor_grading_batch($1) as data',[event])).rows[0].data)
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}',created_at timestamptz not null default now());
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
    `)
    for (const name of ['20261026120000_auth_roles','20261026130000_sync_trusted_roles','20261030120000_copilot_records','20261030130000_gpt_names',
      '20261102041227_reset_and_domain_schema','20261104120000_instructor_reads','20261105130000_instructor_all_students','20261105140000_instructor_grading_reads']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'))
    }
    // Apply the date-only schema prerequisite without the production schedule data.
    await db.exec((await readFile(new URL('../supabase/migrations/20261104055444_official_grading_schedule.sql',import.meta.url),'utf8')).split('-- Keep the send history')[0])
    for (const [id,role] of [[a,'instructor'],[b,'instructor'],[studentUser,'student'],[unlinked,'instructor'],[admin,'administrator']]) {
      await sql('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${id}@example.test`,JSON.stringify({role})])
    }
    await db.exec(`
      insert into public.centres(id,name,short_name) values('${centre}','Test','test');
      insert into public.grades values('unranked','Unranked',null,false,0),('target','Target','Blue',true,1);
      insert into public.grade_tracks values('target','adult');
      insert into public.syllabus_items(id,grade_id,track,category,sort_order,label) values('one','target','adult','Basics',1,'One'),('two','target','adult','Basics',2,'Two');
      insert into public.instructors(id,user_id,first_name,last_name,email) values('${ia}','${a}','A','Instructor','a@example.test'),('${ib}','${b}','B','Instructor','b@example.test');
      insert into public.students(id,user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at) values
        ('${student}','${studentUser}','001','First','Student','s@example.test','${centre}','2000-01-01','2020-01-01'),
        ('${peer}',null,'002','Second','Student','p@example.test','${centre}','2000-01-01','2020-01-01');
      insert into public.events(id,event_type,centre_id,instructor_id,name,starts_at,ends_at) values
        ('${event}','grading','${centre}','${ia}','Grading',now(),now()+interval '1 hour'),
        ('${otherEvent}','class','${centre}','${ia}','Class',now(),now()+interval '1 hour');
      insert into public.gradings(event_id) values('${event}');
      insert into public.event_students(event_id,student_id) values('${event}','${student}'),('${event}','${peer}');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261108152249_instructor_grading_batches.sql',import.meta.url),'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261108154345_resume_editable_grading_batches.sql',import.meta.url),'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261110120000_grading_batch_comments.sql',import.meta.url),'utf8'))
    let batchA,batchB
    await suite.test('new drafts are absent, two instructors own independent matrices and candidate numbers',async () => {
      assert.equal(await get(a),null)
      assert.equal(await latest(a),null)
      await assert.rejects(save(a,0,cells.slice(1)))
      assert.equal(await get(a),null)
      batchA=await save(a,0)
      batchB=await save(b,0,cells.map((c,i)=>({...c,checked:i!==0})))
      assert.notEqual(batchA.id,batchB.id)
      assert.equal(batchA.status,'draft'); assert.equal(batchA.version,1)
      assert.deepEqual(batchA.students.map(s=>s.candidate_number),[1,2])
      assert.deepEqual(batchA.items.map(i=>i.label),['One','Two'])
      assert.equal((await get(a)).results.every(c=>c.checked),true)
      assert.equal((await get(b)).results.filter(c=>!c.checked).length,1)
      assert.equal((await latest(a)).id,batchA.id)
      assert.equal((await latest(b)).id,batchB.id)
      await as(a,async () => assert.equal((await sql('select id from public.grading_batches')).rows.length,1))
      await as(b,async () => assert.equal((await sql('select * from public.grading_batch_results where batch_id=$1',[batchA.id])).rows.length,0))
    })
    await suite.test('instructors see shared grading sessions but not unrelated classes',async () => {
      await as(b,async () => {
        const calendar=(await sql("select public.instructor_calendar(now()-interval '1 day',now()+interval '1 day') as data")).rows[0].data
        assert.deepEqual(calendar.items.map(e=>e.id),[event])
      })
    })
    await suite.test('atomic writes reject stale versions, incomplete, duplicate and invalid cells',async () => {
      for(const values of [cells.slice(1),[...cells,cells[0]],cells.map((c,i)=>i===0?{...c,syllabus_item_id:'foreign'}:c),cells.map((c,i)=>i===0?{...c,checked:null}:c)]) {
        await assert.rejects(save(a,1,values))
      }
      await assert.rejects(save(a,0),e=>e.code==='PGB01')
      assert.equal((await get(a)).version,1)
      assert.equal((await get(a)).results.length,4)
    })
    await suite.test('submitted batches can be revised and resubmitted while prior signed receipts remain immutable',async () => {
      const request=uuid(sequence++)
      const first=await save(a,1,cells,false,null,request)
      assert.deepEqual(await save(a,1,cells,false,null,request),first)
      await assert.rejects(save(a,1,cells.map(c=>({...c,checked:false})),false,null,request),e=>e.code==='PGB01')
      await assert.rejects(save(a,2,cells,true,null))
      await assert.rejects(save(a,2,cells,true,{version:1,strokes:[[{x:2,y:0}]]}))
      const signedRequest=uuid(sequence++)
      const submitted=await save(a,2,cells,true,signature,signedRequest)
      assert.equal(submitted.status,'submitted'); assert.ok(submitted.submitted_at)
      assert.deepEqual(submitted.signature,signature)
      const revised=await save(a,3,cells.map(c=>({...c,checked:false})))
      assert.equal(revised.status,'draft'); assert.equal(revised.version,4)
      assert.equal(revised.signature,null); assert.equal(revised.submitted_at,null)
      assert.equal(revised.results.every(c=>!c.checked),true)
      await assert.rejects(save(a,3),e=>e.code==='PGB01')
      await assert.rejects(save(a,4,revised.results,true,null))
      const resubmitted=await save(a,4,revised.results,true,signature)
      assert.equal(resubmitted.status,'submitted'); assert.equal(resubmitted.version,5)
      assert.equal((await latest(a)).version,5)
      const original=(await sql('select response from public.grading_batch_write_requests where request_id=$1',[signedRequest])).rows[0].response
      assert.equal(original.version,3); assert.deepEqual(original.signature,signature)
      assert.equal(original.results.every(c=>c.checked),true)
      assert.equal((await get(b)).status,'draft')
      const row=(await sql('select current_grade_id,last_graded_at from public.students where id=$1',[student])).rows[0]
      assert.equal(row.current_grade_id,'unranked'); assert.equal(row.last_graded_at,null)
      assert.equal((await sql('select assessment_status from public.event_students where event_id=$1',[event])).rows.every(r=>r.assessment_status===null),true)
    })
    await suite.test('automatic resume selects the latest group for this instructor, never another instructor',async () => {
      await db.exec("insert into public.grade_tracks values('target','children'); insert into public.syllabus_items(id,grade_id,track,category,sort_order,label) values('child-one','target','children','Basics',1,'Children technique');")
      const childCells=[student,peer].map(student_id=>({student_id,syllabus_item_id:'child-one',checked:false}))
      const child=await as(a,async () => (await sql("select public.save_instructor_grading_batch($1,$2,$3,'children','target',0,$4,false,null) as data",[uuid(sequence++),a,event,JSON.stringify(childCells)])).rows[0].data)
      assert.equal((await latest(a)).id,child.id)
      assert.equal((await latest(a)).track,'children')
      assert.equal((await latest(b)).id,batchB.id)
      for(const user of [studentUser,unlinked,admin]) await assert.rejects(latest(user))
    })
    await suite.test('syllabus labels are snapshots and direct writes / impersonation are denied',async () => {
      await sql("update public.syllabus_items set label='Changed' where id='one'")
      assert.equal((await get(b)).items[0].label,'One')
      await assert.rejects(as(a,()=>sql("update public.grading_batches set status='draft' where id=$1",[batchA.id])))
      for(const user of [studentUser,unlinked,admin]) await assert.rejects(save(user,0))
      await assert.rejects(as(a,()=>sql("select public.save_instructor_grading_batch($1,$2,$3,'adult','target',1,$4,false,null)",[uuid(sequence++),b,event,JSON.stringify(cells)])))
    })
    await suite.test('comments save atomically, survive retries and can be cleared',async () => {
      const write = (user, version, comments, request = uuid(sequence++)) => as(user, async () => (await sql(
        "select public.save_instructor_grading_batch_with_comments($1,$2,$3,'adult','target',$4,$5,$6,false,null) as data",
        [request,user,event,version,JSON.stringify(cells),JSON.stringify(comments)]
      )).rows[0].data)
      const comments = [{student_id:student,notes:'Good progress'}, {student_id:peer,notes:null}]
      const request = uuid(sequence++)
      const saved = await write(b,1,comments,request)
      assert.equal(saved.students.find(s=>s.student_id===student).notes,'Good progress')
      assert.deepEqual(await write(b,1,comments,request),saved)
      await assert.rejects(write(b,1,[{...comments[0],notes:'Changed'},comments[1]],request),e=>e.code==='PGB01')
      assert.equal((await get(b)).students.find(s=>s.student_id===student).notes,'Good progress')
      assert.equal((await get(a)).students.find(s=>s.student_id===student).notes,null)
      for (const invalid of [comments.slice(0,1), [comments[0],comments[0]], [{...comments[0],notes:'x'.repeat(2001)},comments[1]]]) {
        await assert.rejects(write(b,2,invalid))
      }
      assert.equal((await get(b)).version,2)
      const cleared = await write(b,2,comments.map(c=>({...c,notes:null})))
      assert.equal(cleared.students.find(s=>s.student_id===student).notes,null)
      await assert.rejects(write(studentUser,0,comments))
    })
    await suite.test('cancelled sessions reject saves and candidate numbers cannot be reassigned',async () => {
      await sql('update public.event_students set candidate_number=99 where event_id=$1 and student_id=$2',[event,student])
      assert.equal((await sql('select candidate_number from public.event_students where event_id=$1 and student_id=$2',[event,student])).rows[0].candidate_number,1)
      await sql("update public.events set status='cancelled' where id=$1",[event])
      await assert.rejects(save(b,3),e=>e.code==='PGB03')
    })
  } finally { await db.close() }
})
