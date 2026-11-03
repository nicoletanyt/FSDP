import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
// Browser-only fixture: exercises the real calendar/shell with a local auth
// context. This entry point is outside index.html and the production bundle.
import { AuthContext } from '../../src/lib/auth-context'
import InstructorLayout from '../../src/layouts/InstructorLayout'
import InstructorDashboard from '../../src/pages/Instructor/InstructorDashboard'
import RootLayout from '../../src/layouts/RootLayout'
import type { Session } from '@supabase/supabase-js'
import type { UserRole } from '../../src/lib/auth'
import FloatingChatbot from '../../src/components/FloatingChatbot'
import '../../src/index.css'
const NativeDate = Date
window.Date = new Proxy(NativeDate, {
  construct(target, args) { return Reflect.construct(target, args.length ? args : [2026, 10, 3, 9, 0]) },
  get(target, property) { return property === 'now' ? () => new NativeDate(2026, 10, 3, 9, 0).getTime() : Reflect.get(target, property) },
})
const requestedRole = new URLSearchParams(location.search).get('fixtureRole')
const role: UserRole | 'guest' = requestedRole === 'student' || requestedRole === 'administrator' || requestedRole === 'guest' ? requestedRole : 'instructor'
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={{session:role === 'guest' ? null : { user: { id: 'audit' } } as Session,profile:role === 'guest' ? null : {id:'audit',first_name:'Test',last_name:role,email:'test@example.com',role,created_at:''},loading:false,error:null,reloadProfile:()=>{},signOut:async()=>{}}}><BrowserRouter><Routes><Route element={<InstructorLayout />}><Route path="/instructor/calendar" element={<InstructorDashboard />} /><Route path="/instructor/dashboard" element={<InstructorDashboard />} /></Route><Route element={<RootLayout />}><Route path="*" element={<p>Navigation fixture page</p>} /></Route></Routes><FloatingChatbot /></BrowserRouter></AuthContext.Provider>)
