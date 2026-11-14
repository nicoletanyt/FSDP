import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
// Browser-only fixture: exercises the real instructor pages/shell with a local auth
// context. This entry point is outside index.html and the production bundle.
import { AuthContext } from '../../src/lib/auth-context'
import InstructorLayout from '../../src/layouts/InstructorLayout'
import NfcTagCapture from '../../src/components/instructor/NfcTagCapture'
import InstructorDashboard from '../../src/pages/Instructor/InstructorDashboard'
import InstructorStudents from '../../src/pages/Instructor/InstructorStudents'
import InstructorStudentDetails from '../../src/pages/Instructor/InstructorStudentDetails'
import InstructorGradingAssessment from '../../src/pages/Instructor/InstructorGradingAssessment'
import InstructorGradingSession, { InstructorGradingSessionPage, LegacySessionChecklistsRedirect } from '../../src/pages/Instructor/InstructorGradingSession'
import InstructorGradingDay from '../../src/pages/Instructor/InstructorGradingDay'
import InstructorProfile from '../../src/pages/Instructor/InstructorProfile'
import RootLayout from '../../src/layouts/RootLayout'
import type { Session } from '@supabase/supabase-js'
import type { UserRole } from '../../src/lib/auth'
import { InstructorApiContext } from '../../src/lib/instructor/data-context'
import { createCalendarFixtureApi } from './instructor-api.fixture'
import { createAppQueryClient } from '../../src/lib/query-client'
import { createQueryAuthBoundary } from '../../src/lib/query-auth-boundary'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'
const queryClient = createAppQueryClient()
queryClient.setDefaultOptions({ ...queryClient.getDefaultOptions(), queries: { ...queryClient.getDefaultOptions().queries, retry: false } })
// Keep the existing fixture's explicit request/failure scenarios deterministic.
Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } })
const NativeDate = Date
window.Date = new Proxy(NativeDate, {
  construct(target, args) { return Reflect.construct(target, args.length ? args : ['2026-11-03T01:00:00Z']) },
  get(target, property) { return property === 'now' ? () => new NativeDate('2026-11-03T01:00:00Z').getTime() : Reflect.get(target, property) },
})
const requestedRole = new URLSearchParams(location.search).get('fixtureRole')
const role: UserRole | 'guest' = requestedRole === 'student' || requestedRole === 'administrator' || requestedRole === 'guest' ? requestedRole : 'instructor'
declare global {
  interface Window {
    switchInstructorFixture: () => void
    instructorSignOutCalls: number
    chatFixture: {
      userId: string; calls: unknown[]; mode: 'ok' | 'error' | 'pending'; aborted: number; release?: () => void; reply?: string
    }
  }
}
window.instructorSignOutCalls = 0

// Explicitly opt-in; no production auth session or cloud request is used.
if (new URLSearchParams(location.search).get('fixtureChat') === 'true') {
  const state = window.chatFixture = { userId: '', calls: [] as unknown[], mode: 'ok' as 'ok' | 'error' | 'pending', aborted: 0, release: undefined as (() => void) | undefined, reply: undefined as string | undefined }
  Object.assign(supabase.auth, { getSession: async () => ({ data: { session: { user: { id: state.userId }, access_token: 'fixture-token' } }, error: null }) })
  Object.defineProperty(supabase, 'functions', { configurable: true, value: { invoke: async (_name: string, options: { body: unknown; signal: AbortSignal }) => {
    state.calls.push(options.body)
    options.signal.addEventListener('abort', () => { state.aborted++ }, { once: true })
    if (state.mode === 'pending') await new Promise<void>(resolve => { state.release = resolve })
    return state.mode === 'error'
      ? { data: null, error: { context: Response.json({ error: 'The chat provider is unavailable. Please retry.' }, { status: 502 }) } }
      : { data: { reply: state.reply ?? 'Your next class is at 10:00 AM at Central.\nCheck the calendar for the full schedule.', sources: [{ label: 'Your calendar', href: '/instructor/calendar?date=2026-11-08' }] }, error: null }
  } } })
}

function FixtureApp() {
  const [account, setAccount] = useState('audit')
  const userId = account === 'audit' ? '00000000-0000-4000-8000-000000090001' : '00000000-0000-4000-8000-000000090002'
  if (window.chatFixture) window.chatFixture.userId = userId
  const [boundary] = useState(() => {
    const value = createQueryAuthBoundary(queryClient)
    if (role !== 'guest') { value.setUser('00000000-0000-4000-8000-000000090001'); value.setRole('00000000-0000-4000-8000-000000090001', role) }
    return value
  })
  const api = useMemo(() => createCalendarFixtureApi(account), [account])
  useEffect(() => { window.switchInstructorFixture = () => {
    const next = '00000000-0000-4000-8000-000000090002'
    boundary.setUser(next)
    if (role !== 'guest') boundary.setRole(next, role)
    setAccount('audit-next')
  } }, [boundary])
  return <AuthContext.Provider value={{
    session: role === 'guest' ? null : { user: { id: userId } } as Session,
    profile: role === 'guest' ? null : { id: userId, first_name: 'Test', last_name: role, email: 'test@example.com', role, created_at: '' },
    loading: false, error: null, reloadProfile: () => {}, signOut: async () => {
      window.instructorSignOutCalls += 1
      await new Promise(resolve => setTimeout(resolve, 400))
      if (new URLSearchParams(location.search).get('fixtureData') === 'sign-out-error' && window.instructorSignOutCalls === 1) {
        throw new Error('Unable to sign out. Try again.')
      }
    },
  }}>
    <InstructorApiContext.Provider value={api}>
      <BrowserRouter><Routes>
        {/* Same wrapper as the real app, so navigation keys behave identically. */}
        <Route element={<NfcTagCapture />}><Route element={<InstructorLayout />}>
          <Route path="/instructor/calendar" element={<InstructorDashboard />} />
          <Route path="/instructor/dashboard" element={<InstructorDashboard />} />
          <Route path="/instructor/students" element={<InstructorStudents />} />
          <Route path="/instructor/students/:studentId" element={<InstructorStudentDetails />} />
          <Route path="/instructor/reports/:eventId" element={<Navigate to="/instructor/calendar" replace />} />
          <Route path="/instructor/assessments/:assessmentId" element={<InstructorGradingAssessment />} />
          <Route path="/instructor/assessments/:eventId/:studentId" element={<InstructorGradingAssessment />} />
          <Route path="/instructor/grading/:eventId" element={<InstructorGradingSession />} />
          <Route path="/instructor/gradings/:eventId" element={<InstructorGradingDay />} />
          <Route path="/instructor/gradings/:eventId/sessions/:sessionId" element={<LegacySessionChecklistsRedirect />} />
          <Route path="/instructor/grading/session/:sessionId" element={<InstructorGradingSessionPage />} />
          <Route path="/instructor/profile" element={<InstructorProfile />} />
        </Route></Route>
        <Route element={<RootLayout />}><Route path="*" element={<p>Navigation fixture page</p>} /></Route>
      </Routes></BrowserRouter>
    </InstructorApiContext.Provider>
  </AuthContext.Provider>
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><FixtureApp /></QueryClientProvider>)
