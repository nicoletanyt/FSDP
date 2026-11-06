import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
// Browser-only fixture: exercises the real instructor pages/shell with a local auth
// context. This entry point is outside index.html and the production bundle.
import { AuthContext } from '../../src/lib/auth-context'
import InstructorLayout from '../../src/layouts/InstructorLayout'
import InstructorDashboard from '../../src/pages/Instructor/InstructorDashboard'
import InstructorStudents from '../../src/pages/Instructor/InstructorStudents'
import InstructorStudentDetails from '../../src/pages/Instructor/InstructorStudentDetails'
import InstructorStudentReports from '../../src/pages/Instructor/InstructorStudentReports'
import InstructorGradingAssessment from '../../src/pages/Instructor/InstructorGradingAssessment'
import RootLayout from '../../src/layouts/RootLayout'
import type { Session } from '@supabase/supabase-js'
import type { UserRole } from '../../src/lib/auth'
import FloatingChatbot from '../../src/components/FloatingChatbot'
import { InstructorApiContext } from '../../src/lib/instructor/data-context'
import { createCalendarFixtureApi } from './instructor-api.fixture'
import '../../src/index.css'
const NativeDate = Date
window.Date = new Proxy(NativeDate, {
  construct(target, args) { return Reflect.construct(target, args.length ? args : ['2026-11-03T01:00:00Z']) },
  get(target, property) { return property === 'now' ? () => new NativeDate('2026-11-03T01:00:00Z').getTime() : Reflect.get(target, property) },
})
const requestedRole = new URLSearchParams(location.search).get('fixtureRole')
const role: UserRole | 'guest' = requestedRole === 'student' || requestedRole === 'administrator' || requestedRole === 'guest' ? requestedRole : 'instructor'
declare global {
  interface Window { switchInstructorFixture: () => void }
}

function FixtureApp() {
  const [account, setAccount] = useState('audit')
  const userId = account === 'audit' ? '00000000-0000-4000-8000-000000090001' : '00000000-0000-4000-8000-000000090002'
  const api = useMemo(() => createCalendarFixtureApi(account), [account])
  useEffect(() => { window.switchInstructorFixture = () => setAccount('audit-next') }, [])
  return <AuthContext.Provider value={{
    session: role === 'guest' ? null : { user: { id: userId } } as Session,
    profile: role === 'guest' ? null : { id: userId, first_name: 'Test', last_name: role, email: 'test@example.com', role, created_at: '' },
    loading: false, error: null, reloadProfile: () => {}, signOut: async () => {},
  }}>
    <InstructorApiContext.Provider value={api}>
      <BrowserRouter><Routes>
        <Route element={<InstructorLayout />}>
          <Route path="/instructor/calendar" element={<InstructorDashboard />} />
          <Route path="/instructor/dashboard" element={<InstructorDashboard />} />
          <Route path="/instructor/students" element={<InstructorStudents />} />
          <Route path="/instructor/students/:studentId" element={<InstructorStudentDetails />} />
          <Route path="/instructor/reports/:eventId" element={<InstructorStudentReports />} />
          <Route path="/instructor/assessments/:assessmentId" element={<InstructorGradingAssessment />} />
          <Route path="/instructor/assessments/:eventId/:studentId" element={<InstructorGradingAssessment />} />
        </Route>
        <Route element={<RootLayout />}><Route path="*" element={<p>Navigation fixture page</p>} /></Route>
      </Routes><FloatingChatbot /></BrowserRouter>
    </InstructorApiContext.Provider>
  </AuthContext.Provider>
}

createRoot(document.getElementById('root')!).render(<FixtureApp />)
