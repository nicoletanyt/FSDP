import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import StudentDashboard from '../../src/pages/Student/StudentDashboard'
import { AuthContext, type AuthContextValue } from '../../src/lib/auth-context'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'draft'
const auth: AuthContextValue = {
  session: null, loading: false, error: null, reloadProfile: () => {}, signOut: async () => {},
  profile: { id: 'fixture-user', first_name: 'Alex', last_name: 'Tan', role: 'student',
    email: 'fixture@example.test', created_at: '2026-01-01T00:00:00Z' },
}
Object.defineProperty(supabase, 'from', { value: (table: string) => {
  const result = table === 'students' ? { data: { id: 'fixture-student' }, error: null } : {
    data: table === 'grading_application_drafts' && ['draft', 'paid'].includes(scenario)
      ? [{ target_grade_id: 'gold', status: scenario === 'paid' ? 'pending_review' : 'checkout_open', created_at: '2026-11-13T10:00:00Z' }]
      : table === 'grading_applications' && scenario === 'submitted' ? [{ target_grade_id: 'gold', status: 'submitted' }] : [],
    error: scenario === 'error' ? new Error('Fixture unavailable') : null,
  }
  const query = { select: () => query, eq: () => query, in: () => query, abortSignal: () => query,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return query
} })
createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={auth}>
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<Outlet context={{ creditAccount: {
          credits: 12, unlimited: false, loading: false, error: null, payment: null, retry: () => {},
        } }} />}>
          <Route path="/dashboard" element={<StudentDashboard />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </AuthContext.Provider>,
)
