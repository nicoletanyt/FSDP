// Test-only database responses; the dashboard, card and credit hook are real.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { useStudentCredits } from '../../src/hooks/use-student-credits'
import { supabase } from '../../src/lib/supabase'
import { AuthContext } from '../../src/lib/auth-context'
import StudentDashboard from '../../src/pages/Student/StudentDashboard'
import StudentCredits from '../../src/pages/Student/StudentCredits'
import '../../src/index.css'

const scenario = new URLSearchParams(location.search).get('scenario')
const passesPage = new URLSearchParams(location.search).get('page') === 'passes'
const stamp = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
const batchRows = [
  { id: 'soon', credits_total: 10, credits_remaining: 4, expires_at: stamp(9), unlimited: false, source: 'purchase', credit_purchases: { pass_title: '10 Session Pass' } },
  { id: 'later', credits_total: 25, credits_remaining: 16, expires_at: stamp(60), unlimited: false, source: 'purchase', credit_purchases: { pass_title: '25 Session Pass' } },
  { id: 'unlimited', credits_total: 0, credits_remaining: 0, expires_at: stamp(40), unlimited: true, source: 'purchase', credit_purchases: { pass_title: '3 Months Unlimited Pass' } },
  { id: 'legacy', credits_total: 12, credits_remaining: 12, expires_at: 'infinity', unlimited: false, source: 'legacy', credit_purchases: null },
  { id: 'expired', credits_total: 10, credits_remaining: 2, expires_at: stamp(-3), unlimited: false, source: 'purchase', credit_purchases: { pass_title: 'Previous 10 Session Pass' } },
  { id: 'used', credits_total: 10, credits_remaining: 0, expires_at: stamp(5), unlimited: false, source: 'purchase', credit_purchases: { pass_title: 'Used 10 Session Pass' } },
].map(row => ({ ...row, created_at: stamp(-30) }))
// The membership is a students row plus the fee in payments, not a credit batch.
const studentRow = {
  id: 'student-fixture', member_no: 'ASJ20260001', membership_status: scenario === 'expired' ? 'expired' : 'active',
  joined_at: '2026-01-10', membership_expires_on: (scenario === 'expired' ? stamp(-1) : stamp(366)).slice(0, 10),
}
const membershipPaymentRow = {
  amount_cents: 6000, description: 'Membership fee', paid_at: stamp(-300), created_at: stamp(-300),
}
let receipts = 0
Object.defineProperty(supabase, 'rpc', {
  value: () => ({
    abortSignal: async () => {
      if (scenario === 'error') return { data: null, error: new Error('Fixture offline') }
      const days = scenario === 'last-day' ? 0.5 : scenario === 'later' ? 22 : scenario === 'expired' ? -1 : 14
      return { data: {
        credits: receipts > 1 ? 35 : 10, unlimited: scenario === 'unlimited', active: true,
        expiring: ['expiring', 'last-day', 'later', 'expired'].includes(scenario ?? '')
          ? { credits: 4, expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() } : null,
      }, error: null }
    },
  }),
})
Object.defineProperty(supabase, 'from', {
  value: (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      gt: () => query,
      or: () => query,
      order: () => query,
      limit: () => query,
      range: () => query,
      abortSignal: () => table === 'credit_batches'
        ? Promise.resolve({ data: scenario === 'empty' ? [] : batchRows, error: scenario === 'error' ? new Error('offline') : null }) : query,
      maybeSingle: async () => {
        if (scenario === 'error') return { data: null, error: new Error('Fixture offline') }
        if (table === 'credit_purchases') {
          receipts++
          return { data: receipts > 1 ? { stripe_session_id: 'cs_fixture' } : null, error: null }
        }
        if (table === 'students') return { data: studentRow, error: null }
        if (table === 'payments') return { data: membershipPaymentRow, error: null }
        return { data: { credits: receipts > 1 ? 35 : 10, unlimited: scenario === 'unlimited', active: true }, error: null }
      },
    }
    return query
  },
})

function Layout() {
  const creditAccount = useStudentCredits('fixture-user', scenario === 'paid' ? 'cs_fixture' : null)
  return <div className="mx-auto max-w-6xl p-4"><Outlet context={{ creditAccount }} /></div>
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthContext.Provider value={{ session: null, profile: passesPage ? {
      id: 'fixture-user', first_name: 'Test', last_name: 'Student', email: 'test@example.com', role: 'student', created_at: stamp(-30),
    } : null, loading: false, error: null, reloadProfile() {}, async signOut() {} }}>
      <MemoryRouter initialEntries={[passesPage ? '/student/credits' : '/dashboard']}>
        <Routes><Route element={<Layout />}>
          <Route path="/dashboard" element={<StudentDashboard />} />
          <Route path="/student/credits" element={<StudentCredits />} />
        </Route></Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  </QueryClientProvider>,
)
