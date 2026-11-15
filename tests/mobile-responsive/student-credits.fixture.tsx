// Test-only database responses; the dashboard, card and credit hook are real.
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { useStudentCredits } from '../../src/hooks/use-student-credits'
import { supabase } from '../../src/lib/supabase'
import StudentDashboard from '../../src/pages/Student/StudentDashboard'
import '../../src/index.css'

const scenario = new URLSearchParams(location.search).get('scenario')
let receipts = 0
Object.defineProperty(supabase, 'from', {
  value: (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      abortSignal: () => query,
      maybeSingle: async () => {
        if (scenario === 'error') return { data: null, error: new Error('Fixture offline') }
        if (table === 'credit_purchases') {
          receipts++
          return { data: receipts > 1 ? { stripe_session_id: 'cs_fixture' } : null, error: null }
        }
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
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes><Route element={<Layout />}><Route path="/dashboard" element={<StudentDashboard />} /></Route></Routes>
  </MemoryRouter>,
)
