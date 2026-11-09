import assert from 'node:assert/strict'
import { handleRequest, invitationCopy } from '../send-class-cover-test-invitation/handler.ts'

const host = 'https://example.supabase.co'
const eventId = '00000000-0000-4000-8000-000000000021'
const instructorId = '00000000-0000-4000-8000-000000000011'
const invitationId = '00000000-0000-4000-8000-000000000022'

Deno.test('test invitation copy links to an authenticated confirmation, not automatic assignment', () => {
  const copy = invitationCopy({ id: eventId, name: '[Cover Test] Weekday 3 PM', centre_id: 'x',
    starts_at: '2099-11-09T07:00:00Z', ends_at: '2099-11-09T08:00:00Z', status: 'scheduled',
    centres: { name: 'Bukit Timah Dojo' } },
  { id: instructorId, first_name: 'Ben', last_name: 'Two', email: 'bentwo@example.com' }, 'suroul29@gmail.com', `http://localhost:5173/instructor/calendar?cover=${invitationId}`)
  assert.match(copy.email_subject, /Cover request/)
  assert.match(copy.email_body, /Ben Two/)
  assert.match(copy.email_body, /Bukit Timah Dojo/)
  assert.match(copy.email_body, new RegExp(`http://localhost:5173/instructor/calendar\\?cover=${invitationId}`))
  assert.match(copy.email_body, /link alone does not grant access/)
})

Deno.test('preview never sends, send reserves once, and rejected attempt stays terminal', async () => {
  const settings: Record<string,string> = { APP_URL: 'https://app.example.com', SUPABASE_URL: host,
    SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service', EMAILJS_TEMPLATE_ID: 'template_test',
    EMAILJS_SERVICE_ID: 'service_test', EMAILJS_PUBLIC_KEY: 'public_test', ADMIN_UNAVAILABILITY_EMAIL: 'suroul29@gmail.com' }
  const old = Object.fromEntries(Object.keys(settings).map(key => [key, Deno.env.get(key)]))
  for (const [key,value] of Object.entries(settings)) Deno.env.set(key,value)
  const originalFetch = globalThis.fetch
  let sends = 0
  let reservations = 0
  let providerRejects = false
  let providerTimesOut = false
  let recipientEmail = 'bentwo@example.com'
  let status = 'sending'
  globalThis.fetch = async (input,init) => {
    const req = new Request(input,init)
    if (req.url === `${host}/auth/v1/user`) return Response.json({ id:'00000000-0000-4000-8000-000000000001', aud:'authenticated', role:'authenticated', email:'admin@example.com', app_metadata:{},user_metadata:{},created_at:new Date().toISOString() })
    if (req.url.includes('/rest/v1/users?')) return Response.json({ role:'administrator' })
    if (req.url.includes('/rest/v1/rpc/preview_class_cover_candidates')) return Response.json([{ instructor_id: instructorId, eligibility:'demo_only_match' }])
    if (req.url.includes('/rest/v1/rpc/reserve_class_cover_test_invitation')) {
      reservations++
      return reservations === 1 ? Response.json(invitationId) : Response.json({code:'23505',message:'Already recorded'},{status:409})
    }
    if (req.url.includes('/rest/v1/events?')) return Response.json({ id:eventId,name:'[Cover Test] Weekday 3 PM',centre_id:'test',
      starts_at:'2099-11-09T07:00:00Z',ends_at:'2099-11-09T08:00:00Z',status:'scheduled',centres:{name:'Bukit Timah Dojo'} })
    if (req.url.includes('/rest/v1/instructors?')) return Response.json({ id:instructorId,first_name:'Ben',last_name:'Two',email:recipientEmail })
    if (req.url.includes('/rest/v1/class_cover_test_invitations?')) {
      const updated = await req.json()
      if (updated.status) status = updated.status
      return new Response(null,{status:204})
    }
    if (req.url === 'https://api.emailjs.com/api/v1.0/email/send') {
      sends++
      const payload = await req.json()
      assert.equal(payload.template_id,'template_test')
      assert.equal(payload.template_params.to_email,recipientEmail)
      assert.match(payload.template_params.email_subject,/Cover request/)
      assert.match(payload.template_params.email_body,/test invitation/i)
      assert.match(payload.template_params.email_body, new RegExp(`instructor/calendar\\?cover=${invitationId}`))
      if (providerTimesOut) throw new Error('Network response unknown')
      return new Response(providerRejects ? 'sensitive: suroul29@gmail.com' : 'OK',{status:providerRejects ? 400 : 200})
    }
    throw new Error(`Unexpected ${req.method} ${req.url}`)
  }
  const request = (action:string) => new Request(host,{method:'POST',headers:{origin:'http://localhost:5173',authorization:'Bearer test-token','content-type':'application/json'},
    body:JSON.stringify({action,event_id:eventId,instructor_id:instructorId})})
  try {
    assert.equal((await handleRequest(new Request(host,{method:'POST'}))).status,403)
    assert.equal((await handleRequest(new Request(host,{method:'OPTIONS',headers:{origin:'http://192.168.1.13:5173'}}))).status,204)
    const preview = await handleRequest(request('preview'))
    assert.equal(preview.status,410)
    assert.equal(sends,0)
    const accepted = await handleRequest(request('send'))
    assert.equal((await accepted.json()).status,'accepted')
    assert.equal(status,'accepted')
    assert.equal(sends,1)
    const duplicate = await handleRequest(request('send'))
    assert.equal(duplicate.status,409)
    assert.equal(sends,1)
    providerRejects = true
    reservations = 0
    recipientEmail = 'benten@example.test.com'
    const failed = await handleRequest(request('send'))
    assert.equal((await failed.json()).status,'failed')
    assert.equal(status,'failed')
    assert.equal(sends,2)
    reservations = 0
    providerTimesOut = true
    const uncertain = await handleRequest(request('send'))
    assert.equal((await uncertain.json()).status,'uncertain')
    assert.equal(status,'uncertain')
    assert.equal(sends,3)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key,value] of Object.entries(old)) value === undefined ? Deno.env.delete(key) : Deno.env.set(key,value)
  }
})
