// Test-only fixture for the student grading payment page. Mounts the real page
// with a fixed auth profile and a stubbed Supabase RPC, so layout and state
// transitions can be checked without an account or database writes.
import { createRoot } from 'react-dom/client'
import type { Session } from '@supabase/supabase-js'
import App from '../../src/App'
import { MemoryRouter, Route, Routes } from 'react-router'
import GradingPayment from '../../src/pages/Student/GradingPayment'
import { AuthContext, type AuthContextValue } from '../../src/lib/auth-context'
import { supabase } from '../../src/lib/supabase'
import type { UserProfile } from '../../src/lib/auth'
import '../../src/index.css'

const params = new URLSearchParams(location.search)
const fail = params.get('rpc') === 'fail'
const slow = params.get('rpc') === 'slow'
const appRoute = params.get('appRoute')

const profile: UserProfile = {
  id: '00000000-0000-4000-8000-000000000001',
  first_name: 'Alex',
  last_name: 'Tan',
  email: 'alex.tan@example.com',
  role: 'student',
  created_at: '2026-01-01T00:00:00.000Z',
}

Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  value: async (name: string) => {
    await new Promise((resolve) => setTimeout(resolve, slow ? 2500 : 250))
    window.gradingPaymentRpcCalls = (window.gradingPaymentRpcCalls ?? 0) + 1
    if (fail) return { data: null, error: { message: 'Fixture RPC failure' } }
    if (name !== 'record_grading_payment') return { data: null, error: { message: `Unexpected RPC ${name}` } }
    return {
      data: [
        {
          application_id: '11111111-1111-4111-8111-111111111111',
          grading_event_id: '22222222-2222-4222-8222-222222222222',
          target_grade_id: '33333333-3333-4333-8333-333333333333',
          submitted_at: '2026-11-11T04:00:00.000Z',
        },
      ],
      error: null,
    }
  },
})

declare global {
  interface Window {
    gradingPaymentRpcCalls?: number
  }
}

const auth: AuthContextValue = {
  session: appRoute ? { user: { id: profile.id } } as Session : null,
  profile,
  loading: false,
  error: null,
  reloadProfile: () => {},
  signOut: async () => {},
}

const state = {
  studentName: params.get('student') ?? 'Alex Tan',
  currentBelt: '5th Kyu',
  targetGradeId: params.get('grade') ?? '4-kyu',
  applicationDeadline: params.get('deadline') ?? undefined,
  gradingEventId: params.has('application') ? '22222222-2222-4222-8222-222222222222' : undefined,
}

if (appRoute) history.replaceState(null, '', appRoute)

createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={auth}>
    {appRoute ? <App /> : <MemoryRouter initialEntries={[{ pathname: '/grading/payment', state }]}>
      <Routes>
        <Route path="/grading/payment" element={<GradingPayment />} />
        <Route path="/grading/applications" element={<h1>Grading fixture route</h1>} />
      </Routes>
    </MemoryRouter>}
  </AuthContext.Provider>,
)
