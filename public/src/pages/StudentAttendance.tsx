import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StudentContext } from '@/layouts/StudentLayout'
import { addDays, dateTime, formatTime, isEligible, prettyDate } from '@/lib/student-schedule'
import type { ClassOffering, Enrollment } from '@/lib/student-schedule'

function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1) }
function monthShift(date: Date, n: number) { return new Date(date.getFullYear(), date.getMonth() + n, 1) }
function labelFor(e: Enrollment, session: ClassOffering) {
  if (e.status === 'attended') return 'Attended'
  if (e.status === 'missed') return 'Absent'
  if (dateTime(session).getTime() <= Date.now()) return 'Past session · not marked'
  return e.status === 'make-up' ? 'Make-up class' : 'Enrolled'
}
export default function StudentAttendance() {
  const { classes, schedule } = useOutletContext<StudentContext>()
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [month, setMonth] = useState(() => monthStart(new Date()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState<string | null>(null)
  const [replacement, setReplacement] = useState('')
  const [message, setMessage] = useState('')
  const entries = useMemo(() => schedule.enrollments.flatMap(e => {
    const session = classes.find(c => c.id === e.id)
    return session ? [{ ...e, session }] : []
  }).sort((a, b) => dateTime(a.session).getTime() - dateTime(b.session).getTime()), [classes, schedule.enrollments])
  const future = entries.filter(e => dateTime(e.session).getTime() > Date.now() && (e.status === 'enrolled' || e.status === 'make-up'))
  const history = entries.filter(e => dateTime(e.session).getTime() <= Date.now() || e.status === 'attended' || e.status === 'missed')
  const alternatives = useMemo(() => classes.filter(c => c.id !== rescheduling && dateTime(c).getTime() > Date.now() && isEligible(c, schedule.belt) && !schedule.check(c, rescheduling ?? undefined)).slice(0, 45), [classes, rescheduling, schedule])
  const start = addDays(month, -month.getDay())
  const days = Array.from({ length: Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, i) => addDays(start, i))
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const highlighted = selectedDate ? entries.filter(e => e.session.dateId === selectedDate) : entries.filter(e => e.session.date.getMonth() === month.getMonth() && e.session.date.getFullYear() === month.getFullYear())
  function renderRow(item: (typeof entries)[number]) {
    const upcoming = dateTime(item.session).getTime() > Date.now() && (item.status === 'enrolled' || item.status === 'make-up')
    return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-4 last:border-b-0">
      <div className="min-w-0"><p className="font-semibold">{item.session.title}</p><p className="mt-1 text-sm text-muted-foreground">{prettyDate(item.session.date)} · {formatTime(item.session.startTime)} – {formatTime(item.session.endTime)}</p><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" />{item.session.centre} · {item.session.instructor}</p><span className="mt-2 inline-block rounded-full bg-muted px-2 py-1 text-xs font-medium">{labelFor(item, item.session)}</span></div>
      {upcoming && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setRescheduling(item.id); setReplacement(''); setMessage('') }}>Reschedule</Button><Button variant="ghost" size="sm" onClick={() => { schedule.cancel(item.id); setMessage('Demo enrolment cancelled.') }}>Cancel</Button></div>}
    </div>
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold">My schedule & attendance</h2><p className="mt-1 text-sm text-muted-foreground">View enrolled sessions, previous records and make-up classes.</p></div><Button render={<Link to="/dashboard/classes" />}>Browse classes</Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader><CardTitle>Upcoming</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{future.length}</p></CardContent></Card><Card><CardHeader><CardTitle>Attended</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{history.filter(e => e.status === 'attended').length}</p></CardContent></Card><Card><CardHeader><CardTitle>Make-up classes</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{future.filter(e => e.status === 'make-up').length}</p></CardContent></Card></div>
    {message && <p role="status" className="rounded-lg border bg-muted px-4 py-3 text-sm">{message}</p>}
    <div className="inline-flex rounded-lg border bg-muted p-1"><Button size="sm" variant={view === 'calendar' ? 'default' : 'ghost'} onClick={() => setView('calendar')}><CalendarDays className="size-4" /> Calendar</Button><Button size="sm" variant={view === 'list' ? 'default' : 'ghost'} onClick={() => setView('list')}><List className="size-4" /> List</Button></div>
    {view === 'calendar' ? <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{month.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}</CardTitle><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => { setMonth(m => monthShift(m, -1)); setSelectedDate(null) }}><ChevronLeft className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Next month" onClick={() => { setMonth(m => monthShift(m, 1)); setSelectedDate(null) }}><ChevronRight className="size-4" /></Button></div></div></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}</div><div className="grid grid-cols-7 gap-1">{days.map(d => { const id = dateKey(d); const count = entries.filter(e => e.session.dateId === id).length; return <button type="button" key={id} onClick={() => setSelectedDate(current => current === id ? null : id)} aria-pressed={selectedDate === id} className={`flex min-h-12 flex-col items-center justify-center rounded-lg border text-sm transition-colors hover:bg-muted ${d.getMonth() !== month.getMonth() ? 'text-muted-foreground/40' : ''} ${selectedDate === id ? 'border-primary bg-accent' : 'border-transparent'}`}><span>{d.getDate()}</span>{count > 0 && <span className="mt-1 size-1.5 rounded-full bg-primary" title={`${count} sessions`} />}</button> })}</div><div className="border-t pt-4"><p className="mb-2 text-sm font-semibold">{selectedDate ? `Sessions on ${selectedDate}` : 'Sessions this month'}</p>{highlighted.length ? highlighted.map(renderRow) : <p className="py-3 text-sm text-muted-foreground">No enrolled sessions for this selection.</p>}</div></CardContent></Card> : <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Upcoming enrolled sessions</CardTitle></CardHeader><CardContent>{future.length ? future.map(renderRow) : <p className="text-sm text-muted-foreground">No upcoming sessions.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Attendance history</CardTitle></CardHeader><CardContent>{history.length ? history.map(renderRow) : <p className="text-sm text-muted-foreground">No attendance records yet. Instructors will eventually supply attendance data through the shared backend.</p>}</CardContent></Card></div>}
    {rescheduling && <div role="dialog" aria-modal="true" aria-labelledby="reschedule-heading" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg space-y-4 rounded-xl border bg-background p-6 shadow-xl"><h3 id="reschedule-heading" className="text-xl font-semibold">Reschedule class</h3><p className="text-sm text-muted-foreground">Select a replacement session. The original booking is removed only after confirming a valid replacement.</p><label className="block space-y-2 text-sm"><span>Available classes</span><select value={replacement} onChange={e => setReplacement(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2"><option value="">Choose a replacement</option>{alternatives.map(c => <option key={c.id} value={c.id}>{prettyDate(c.date)} · {c.title} · {formatTime(c.startTime)} · {c.centre}</option>)}</select></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRescheduling(null)}>Close</Button><Button disabled={!replacement} onClick={() => { const item = classes.find(c => c.id === replacement); if (!item) return; const error = schedule.reschedule(rescheduling, item); setMessage(error ?? `Rescheduled to ${prettyDate(item.date)} (${item.title}). Saved only in this browser.`); if (!error) setRescheduling(null) }}>Confirm reschedule</Button></div></div></div>}
    <p className="text-xs text-muted-foreground">Demo records are local to this device. Actual attendance cannot be verified until the group connects instructor check-ins and a shared attendance database.</p>
  </div>
}
