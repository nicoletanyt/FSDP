import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { SlidersHorizontal } from 'lucide-react'
import ClassCard from '@/components/student/ClassCard'
import { Button } from '@/components/ui/button'
import type { StudentContext } from '@/layouts/StudentLayout'
import { beltRanks, dateTime, isEligible, isRecommended } from '@/lib/student-schedule'
import type { BeltRank } from '@/lib/student-schedule'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const field = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
export default function StudentClasses() {
  const { classes, schedule } = useOutletContext<StudentContext>()
  const [centre, setCentre] = useState('all')
  const [day, setDay] = useState('all')
  const [period, setPeriod] = useState('all')
  const [eligibility, setEligibility] = useState('eligible')
  const [instructor, setInstructor] = useState('all')
  const [message, setMessage] = useState('')
  const centres = [...new Set(classes.map(c => c.centre))]
  const instructors = [...new Set(classes.map(c => c.instructor))]
  const results = useMemo(() => classes.filter(c => {
    const hour = Number(c.startTime.slice(0, 2))
    return dateTime(c).getTime() > Date.now() && (centre === 'all' || c.centre === centre)
      && (day === 'all' || c.date.getDay() === Number(day))
      && (instructor === 'all' || c.instructor === instructor)
      && (period === 'all' || (period === 'morning' && hour < 12) || (period === 'afternoon' && hour >= 12 && hour < 17) || (period === 'evening' && hour >= 17))
      && (eligibility !== 'eligible' || isEligible(c, schedule.belt))
      && (eligibility !== 'recommended' || isRecommended(c, schedule.belt))
  }), [classes, centre, day, period, instructor, eligibility, schedule.belt])
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Class timetable & enrolment</h2><p className="mt-1 text-sm text-muted-foreground">Explore training sessions at different centres and enrol in a suitable class.</p></div><Button variant="outline" render={<Link to="/dashboard/attendance" />}>View my schedule</Button></div>
    <div className="rounded-xl border bg-card p-4 shadow-sm"><h3 className="mb-4 flex items-center gap-2 font-semibold"><SlidersHorizontal className="size-4" /> Filter classes</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-sm"><span>Training centre</span><select className={field} value={centre} onChange={e => setCentre(e.target.value)}><option value="all">All centres</option>{centres.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>Day of week</span><select className={field} value={day} onChange={e => setDay(e.target.value)}><option value="all">Any day</option>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>Time of day</span><select className={field} value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Any time</option><option value="morning">Morning (before 12 PM)</option><option value="afternoon">Afternoon (12–5 PM)</option><option value="evening">Evening (5 PM onwards)</option></select></label>
      <label className="space-y-1 text-sm"><span>Belt eligibility</span><select className={field} value={eligibility} onChange={e => setEligibility(e.target.value)}><option value="eligible">Eligible for my belt</option><option value="recommended">Recommended for my belt</option><option value="all">All levels</option></select></label>
      <label className="space-y-1 text-sm"><span>Instructor</span><select className={field} value={instructor} onChange={e => setInstructor(e.target.value)}><option value="all">All instructors</option>{instructors.map(i => <option key={i}>{i}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>My belt (demo setting)</span><select className={field} value={schedule.belt} onChange={e => { schedule.setBelt(e.target.value as BeltRank); setMessage('') }}>{beltRanks.map(b => <option key={b}>{b}</option>)}</select></label>
    </div></div>
    {message && <p role="status" className="rounded-lg border bg-muted px-4 py-3 text-sm">{message}</p>}
    <div className="flex flex-wrap justify-between gap-2"><p className="text-sm text-muted-foreground">Showing {results.length} upcoming sessions</p><Button variant="ghost" size="sm" onClick={() => { setCentre('all'); setDay('all'); setPeriod('all'); setEligibility('eligible'); setInstructor('all') }}>Reset filters</Button></div>
    {results.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{results.slice(0, 60).map(c => <ClassCard key={c.id} item={c} recommended={isRecommended(c, schedule.belt)} booked={schedule.active.some(e => e.id === c.id)} onEnroll={() => {
      if (!isEligible(c, schedule.belt)) { setMessage('This class is not eligible for the selected belt.'); return }
      const error = schedule.enroll(c)
      setMessage(error ?? `Enrolled in ${c.title} on ${c.date.toLocaleDateString('en-SG')}. This demo enrolment is saved only in your browser.`)
    }} />)}</div> : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No classes match these filters. Try broadening your search.</div>}
    {results.length > 60 && <p className="text-sm text-muted-foreground">Showing the first 60 matching sessions. Narrow your filters to find another date.</p>}
  </div>
}
