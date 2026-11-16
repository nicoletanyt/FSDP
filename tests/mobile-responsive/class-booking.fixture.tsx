// Test-only schedule and credits; the booking page itself is real.
// ?credits=<n> sets the balance (default 10), ?credits=unlimited for a pass.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { StudentClassBooking } from '../../src/pages/StudentClasses'
import type { ClassOffering } from '../../src/lib/student-schedule'
import { pageWidth } from '../../src/lib/page-width'
import { cn } from '../../src/lib/utils'
import '../../src/index.css'

const query = new URLSearchParams(location.search)
const creditParam = query.get('credits') ?? '10'
const type = 'Adults'

function day(offset: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

function session(id: string, offset: number, start: string, end: string, centre: string, instructor: string, capacity: number, occupied: number): ClassOffering {
  const date = day(offset)
  const at = (time: string) => { const [h, m] = time.split(':').map(Number); const d = new Date(date); d.setHours(h, m); return d.toISOString() }
  return { id, templateId: `t-${id}`, date, dateId: `d-${offset}`, title: type, classType: type, centre, instructor, startTime: start, endTime: end,
    level: 'All grades, adults 16 and over', capacity, occupied, startsAt: at(start), endsAt: at(end), scheduled: true, bookable: true }
}

const classes = [
  session('a1', 2, '09:00', '10:30', 'Central Dojo', 'Sensei Tan', 20, 8),
  session('a2', 2, '11:00', '12:30', 'Central Dojo', 'Sensei Tan', 20, 17),
  session('a3', 2, '19:00', '20:30', 'Tampines Dojo', 'Sensei Lim', 16, 16),
  session('a4', 2, '19:30', '21:00', 'Jurong Dojo', 'Sensei Wong', 18, 4),
  session('b1', 4, '18:00', '19:30', 'Central Dojo', 'Sensei Tan', 20, 11),
  session('b2', 4, '19:30', '21:00', 'Bishan Dojo', 'Sensei Ng', 14, 3),
  session('c1', 6, '10:00', '11:30', 'Tampines Dojo', 'Sensei Lim', 16, 2),
]
const booked = new Set(['b2'])

function Layout() {
  const [waitlist, setWaitlist] = useState<string[]>([])
  const unlimited = creditParam === 'unlimited'
  const credits = unlimited ? 0 : Number(creditParam)
  const creditAccount = { credits, unlimited, loading: false, error: '', retry: async () => {} }
  const schedule = {
    classes, enrollments: [...booked].map(id => ({ id, status: 'enrolled' as const })), waitlist, loading: false, error: '', saving: false,
    grade: '5th kyu', linked: true, active: true, retry() {},
    isBooked: (id: string) => booked.has(id),
    isWaitlisted: (id: string) => waitlist.includes(id),
    isFull: (s: ClassOffering) => s.occupied >= s.capacity,
    enroll: async () => null, cancel: async () => null, reschedule: async () => null,
    joinWaitlist: async (s: ClassOffering) => { setWaitlist(w => [...w, s.id]); return null },
    leaveWaitlist: async (id: string) => { setWaitlist(w => w.filter(x => x !== id)); return null },
  }
  // Same frame as RootLayout's student <main>.
  return <main className={cn('p-6 lg:py-8', pageWidth)}>
    <Outlet context={{ classes, schedule, credits, creditAccount, creditError: false, refreshCredits: async () => {} }} />
  </main>
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[`/classes/choose?type=${encodeURIComponent(type)}`]}>
    <Routes><Route element={<Layout />}>
      <Route path="/classes/choose" element={<StudentClassBooking />} />
    </Route></Routes>
  </MemoryRouter>,
)
