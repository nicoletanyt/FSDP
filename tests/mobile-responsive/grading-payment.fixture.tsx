// Real application/payment pages with database-shaped responses. No charge or
// Supabase write is performed; browser tests intercept the Stripe navigation.
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import GradingPayment from '../../src/pages/Student/GradingPayment'
import StudentGrading from '../../src/pages/Student/StudentGrading'
import { AuthContext, type AuthContextValue } from '../../src/lib/auth-context'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'

const params = new URLSearchParams(location.search)
const eventId = '22222222-2222-4222-8222-222222222222'
const gradeId = params.get('grade') ?? 'blue-gold-5th-kyu'
const late = !params.has('onTime')
const deadline = late ? '2020-01-01' : '2099-01-01'
const price = late ? 7700 : 5500
let confirmed = false
let statusCalls = 0
declare global { interface Window { gradingCheckoutCalls: Record<string, unknown>[] } }
window.gradingCheckoutCalls = []

Object.defineProperty(supabase, 'rpc', { value: (name: string) => ({
  abortSignal: async () => {
    if (name === 'my_grading_checkout_options') return { data: params.has('empty') ? [] : [{
      id: eventId, name: 'Adult grading', grading_date: '2026-12-15', application_deadline: deadline,
      centre_name: 'ASK Dojo', venue_address: 'Singapore', target_grade: gradeId, grade_label: 'Blue-Gold (5th Kyu)',
      applied: confirmed, base_amount: 5500, late_amount: late ? 2200 : 0, total_amount: price,
    }], error: null }
    if (name === 'my_grading_readiness') return { data: [{ target_grade_id: gradeId,
      key: 'sessions', label: 'Training sessions', actual: '26', required: '24', met: true }], error: null }
    throw new Error(`Unexpected fixture RPC ${name}`)
  },
}) })
Object.defineProperty(supabase, 'from', { value: (table: string) => {
  const grades = [
    { id: 'blue-6th-kyu', label: 'Blue (6th Kyu)', sort_order: 7 },
    { id: 'blue-silver-6th-kyu', label: 'Blue-Silver (6th Kyu)', sort_order: 8 },
    { id: 'blue-gold-5th-kyu', label: 'Blue-Gold (5th Kyu)', sort_order: 9 },
    { id: 'brown-4th-kyu', label: 'Brown (4th Kyu)', sort_order: 10 },
  ]
  const trackRows = grades.flatMap((grade) => [
    { grade_id: grade.id, track: 'children' },
    ...(grade.id.includes('silver') ? [] : [{ grade_id: grade.id, track: 'adult' }]),
  ])
  const reference: Record<string, unknown[]> = {
    grades, grade_tracks: trackRows,
    grade_requirements: trackRows.map((row) => ({ ...row, fee_cents: row.grade_id === 'blue-gold-5th-kyu' ? 5500 : 5000 })),
    grading_application_drafts: params.has('savedDraft') || params.get('appRoute')?.includes('test-success') ? [{
      id: '33333333-3333-4333-8333-333333333333', target_grade_id: 'blue-gold-5th-kyu',
      status: 'preview_paid', created_at: '2026-11-13T13:00:00Z',
    }] : [],
  }
  if (table !== 'students') {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
      abortSignal: async () => ({ data: reference[table], error: null }) }
    return query
  }
  const query = { select: () => query, eq: () => query, abortSignal: () => query,
    maybeSingle: async () => ({ data: params.has('missingStudent') ? null : {
      current_grade_id: 'blue-6th-kyu', date_of_birth: params.has('child') ? '2020-01-01' : '2000-01-01',
    }, error: null }) }
  return query
} })
Object.defineProperty(supabase, 'functions', { value: { invoke: async (_name: string, { body }: { body: Record<string, unknown> }) => {
  window.gradingCheckoutCalls.push(body)
  await new Promise((resolve) => setTimeout(resolve, params.get('rpc') === 'slow' ? 2500 : body.action === 'checkout' ? 600 : 100))
  if (params.get('rpc') === 'fail') return { data: null, error: new Error('Unable to contact checkout. Please try again.') }
  if (body.action === 'quote') return { data: { quote: {
    eventId, targetGradeId: gradeId, gradeLabel: '5th Kyu', baseFeeCents: 5500,
    lateFeeCents: late ? 2200 : 0, totalCents: price, applicationDeadline: deadline,
  } }, error: null }
  if (body.action === 'checkout' || body.action === 'test-checkout') return { data: { url: 'https://checkout.stripe.com/c/pay/fixture_grading' }, error: null }
  if (body.action === 'test-status') return { data: { paid: true, draftSaved: true }, error: null }
  if (body.action === 'status') {
    confirmed = ++statusCalls > 1
    return { data: { paid: confirmed }, error: null }
  }
  throw new Error('Unexpected fixture action')
} } })

const auth: AuthContextValue = {
  session: { user: { id: '00000000-0000-4000-8000-000000000001' } } as Session,
  profile: { id: '00000000-0000-4000-8000-000000000001', first_name: 'Alex', last_name: 'Tan',
    role: 'student', email: 'alex@example.test', created_at: '2026-01-01T00:00:00Z' },
  loading: false, error: null, reloadProfile: () => {}, signOut: async () => {},
}
const route = params.get('appRoute') ?? '/grading/payment'
const state = params.has('application') ? {
  targetGradeId: gradeId, gradingEventId: eventId, gradingDate: '2026-12-15',
  applicationDeadline: deadline, expectedTotalCents: params.has('repriced') ? 5500 : price,
} : undefined
createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={auth}>
    <MemoryRouter initialEntries={[{ pathname: route.split('?')[0], search: route.includes('?') ? '?' + route.split('?')[1] : '', state }]}>
      <Routes>
        <Route path="/grading" element={<StudentGrading />} />
        <Route path="/grading/applications" element={<StudentGrading />} />
        <Route path="/grading/payment" element={<GradingPayment />} />
      </Routes>
    </MemoryRouter>
  </AuthContext.Provider>,
)
