import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, CreditCard, HeartPulse, Mail, MapPin, Phone, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import GradeBadge from '@/components/instructor/DatabaseGradeBadge'
import InstructorDataStatus from '@/components/instructor/InstructorDataStatus'
import StudentSessionHistory from '@/components/instructor/StudentSessionHistory'
import { useAuth } from '@/hooks/use-auth'
import { useInstructorQuery } from '@/hooks/use-instructor-data'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId, toSingaporeDateTime } from '@/lib/instructor/adapters'
import { directoryStudent, singaporeToday } from '@/lib/instructor/directory'
import { attendanceTotals, historyDate, instructorName, loadStudentContext } from '@/lib/instructor/student-detail'
import type { StudentDetail, StudentId } from '@/lib/instructor/types'
import { cn } from 'cn'

type DetailTab = 'overview' | 'sessions' | 'grading'

function StudentContactDetails({ detail }: { detail: StudentDetail }) {
  const { student } = detail
  return <section className="space-y-3 lg:space-y-2" aria-label="Contact information">
    <h3>Contact</h3>
    {student.email ? <a href={`mailto:${student.email}`} className="detail-body flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-0 lg:py-1">
      <Mail aria-hidden="true" className="size-3.5 shrink-0" /><span className="break-all">{student.email}</span>
    </a> : <p className="detail-body text-sm text-muted-foreground">Email not recorded.</p>}
    {student.phone ? <a href={`tel:${student.phone.replaceAll(' ', '')}`} className="detail-body flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-0 lg:py-1">
      <Phone aria-hidden="true" className="size-3.5 shrink-0" /><span className="break-all">{student.phone}</span>
    </a> : <p className="detail-body text-sm text-muted-foreground">Phone not recorded.</p>}
    <div className="space-y-3 border-t pt-4 lg:space-y-2 lg:pt-3" aria-label="Emergency contacts">
      <h3>Emergency contacts</h3>
      {detail.emergencyContacts.length ? detail.emergencyContacts.map(contact => <div key={contact.id} className="space-y-1">
        <p className="detail-body text-sm"><span className="font-medium">{contact.name}</span><span className="text-muted-foreground"> · {contact.relationship}{contact.is_primary ? ' · Primary' : ''}</span></p>
        <a href={`tel:${contact.phone.replaceAll(' ', '')}`} className="detail-body inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline lg:min-h-0 lg:py-1">{contact.phone}</a>
      </div>) : <p className="detail-body text-sm text-muted-foreground">No emergency contacts recorded.</p>}
    </div>
  </section>
}

function StudentInformationCards({ detail }: { detail: StudentDetail }) {
  const profile = directoryStudent(detail, singaporeToday())
  const membership = detail.student.membership_status
  return <div className="space-y-3" aria-label="Student information">
    <Card size="sm" className="detail-card"><CardContent className="space-y-2">
      <h3 className="detail-label text-xs text-muted-foreground">Grading</h3>
      <div className="flex items-center justify-between gap-3"><GradeBadge grade={profile.grade} showBeltLabel className="min-w-0 px-3 py-1.5" />
        <p className="detail-meta min-w-0 text-right text-sm text-muted-foreground">{profile.trackLabel}</p></div>
    </CardContent></Card>
    <Card size="sm" className="detail-card"><CardContent className="space-y-2">
      <h3 className="detail-label text-xs text-muted-foreground">Principal Dojo</h3>
      <p className="detail-body flex items-center gap-1.5 text-sm"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />{profile.principalDojo}</p>
    </CardContent></Card>
    <Card size="sm" className="detail-card"><CardContent className="space-y-2">
      <h3 className="detail-label text-xs text-muted-foreground">Membership status</h3>
      <p className={cn('detail-status inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium capitalize', membership === 'active'
        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-muted text-muted-foreground')}>
        <CreditCard aria-hidden="true" className="size-3.5" />{membership}
      </p>
    </CardContent></Card>
  </div>
}

function StudentInformationActions({ detail }: { detail: StudentDetail }) {
  return <div className="grid grid-cols-2 gap-2" aria-label="Contact and medical actions">
    {(['contact', 'medical'] as const).map(action => <Dialog key={action}>
      <DialogTrigger render={<Button variant="outline" size="touch" className="h-auto min-w-0 gap-2 px-3 py-2 whitespace-normal" />}>
        {action === 'contact' ? <Phone aria-hidden="true" className="size-4 shrink-0" /> : <HeartPulse aria-hidden="true" className="size-4 shrink-0" />}
        <span className="min-w-0">{action === 'contact' ? 'Contact' : 'Medical alerts'}</span>
        {action === 'medical' && detail.medicalAlerts.length > 0 && <span className="detail-status shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">{detail.medicalAlerts.length}</span>}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="student-detail-view max-h-[85dvh] overflow-y-auto">
        <DialogHeader className="flex-row items-center justify-between gap-4">
          <DialogTitle>{action === 'contact' ? 'Contact details' : 'Medical alerts'}</DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon-touch" className="-my-2 -mr-2" />}><X aria-hidden="true" /><span className="sr-only">Close</span></DialogClose>
        </DialogHeader>
        {action === 'contact' ? <StudentContactDetails detail={detail} /> : <div className="space-y-2">
          {detail.medicalAlerts.length ? detail.medicalAlerts.map(alert => <p key={alert.id} className="detail-body rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">{alert.description}</p>)
            : <p className="detail-body text-sm text-muted-foreground">No active medical alerts recorded.</p>}
        </div>}
      </DialogContent>
    </Dialog>)}
  </div>
}

function AttendanceSummary({ studentId }: { studentId: StudentId }) {
  const api = useInstructorApi()
  const load = useCallback((signal: AbortSignal) => api.getStudentSummary(studentId, signal), [api, studentId])
  const summary = useInstructorQuery(`student-summary:${studentId}`, load)
  const totals = summary.data && attendanceTotals(summary.data)
  return <section className="detail-section" aria-label="Attendance summary">
    <div className="detail-section-header"><h2>Attendance</h2></div>
    {summary.status !== 'success' ? <InstructorDataStatus loading={summary.status === 'loading'} error={summary.error} onRetry={summary.retry} /> : <>
      <p className="detail-meta text-sm text-muted-foreground">{summary.data.periodStart && summary.data.periodEnd
        ? `Reporting period: ${historyDate(summary.data.periodStart)} – ${historyDate(summary.data.periodEnd)}` : 'No completed sessions recorded'}</p>
      <Card size="sm" className="detail-card"><CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="detail-label text-xs text-muted-foreground">Attendance rate</dt>
            <dd className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums"><span className="text-2xl font-semibold">{totals?.rate == null ? '—' : `${totals.rate}%`}</span>
              <span className="detail-meta text-sm text-muted-foreground">{totals?.attended}/{totals?.eligible} sessions</span></dd>
          </div>
          <div className="border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4"><dt className="detail-label text-xs text-muted-foreground">Last attended</dt>
            <dd><p className="mt-2 text-lg font-semibold tabular-nums">{summary.data.lastAttended ? historyDate(summary.data.lastAttended.event.starts_at) : 'Not recorded'}</p>
              <p className="detail-meta mt-1 text-sm text-muted-foreground">{summary.data.lastAttended
                ? `${summary.data.lastAttended.event.name} · ${summary.data.lastAttended.centre?.name ?? 'Dojo not recorded'}` : 'No attended sessions recorded'}</p></dd>
          </div>
        </dl>
        <p className="detail-meta mt-4 text-sm text-muted-foreground">{summary.data.pastSessions} completed classes · {summary.data.present} present · {summary.data.late} late · {summary.data.absent} absent · {summary.data.excused} excused · {summary.data.unmarked} unmarked</p>
        <p className="detail-meta mt-2 text-sm text-muted-foreground">Present and late count as attended. Excused and unmarked classes are excluded from the rate.</p>
        <p className="detail-meta mt-2 text-sm text-muted-foreground">{summary.data.cycleAttended} attended since {historyDate(`${summary.data.cycleStart}T00:00:00+08:00`)} (current training cycle).</p>
      </CardContent></Card>
      {summary.data.consecutiveAbsences >= 2 && <p role="status" className="detail-body flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{summary.data.consecutiveAbsences} consecutive absences in the most recent sessions. Review attendance in the Sessions tab.
      </p>}
    </>}
  </section>
}

function RecentFeedback({ studentId, onViewSessions }: { studentId: StudentId; onViewSessions: () => void }) {
  const api = useInstructorApi()
  const load = useCallback((signal: AbortSignal) => api.getStudentHistory(studentId, { eventType: 'class', reportsOnly: true, limit: 2, signal }), [api, studentId])
  const feedback = useInstructorQuery(`student-feedback:${studentId}`, load)
  return <section className="detail-section">
    <div className="detail-section-header"><h2>Recent feedback</h2><Button variant="ghost" size="touch" onClick={onViewSessions} className="ml-auto">View sessions<ChevronRight aria-hidden="true" /></Button></div>
    {feedback.status !== 'success' ? <InstructorDataStatus loading={feedback.status === 'loading'} error={feedback.error} onRetry={feedback.retry} />
      : <Card size="sm" className="detail-card"><CardContent className="space-y-4">
        {feedback.data.items.length ? feedback.data.items.map(session => <article key={session.event.id} className="space-y-2 not-first:border-t not-first:pt-4">
          <h3 className="text-base font-semibold">{session.event.name}</h3>
          <p className="detail-meta text-sm text-muted-foreground">{historyDate(session.event.starts_at)} · {session.reportAuthor ? instructorName(session.reportAuthor) : 'Report author not recorded'}</p>
          <p className="detail-body max-w-prose whitespace-pre-wrap text-sm wrap-break-word">{session.record.report}</p>
        </article>) : <p className="detail-body text-sm text-muted-foreground">No feedback recorded yet.</p>}
      </CardContent></Card>}
  </section>
}

function GradingReadPlaceholder({ title }: { title: string }) {
  return <section className="detail-section"><div className="detail-section-header"><h2>{title}</h2>
    {title === 'Grading eligibility' && <Button size="touch" disabled>Review grading</Button>}</div>
    <Card size="sm" className="detail-card"><CardContent><p className="detail-body text-sm text-muted-foreground">Grading records and readiness are not connected yet.</p></CardContent></Card>
  </section>
}

function StudentDetailContent({ detail }: { detail: StudentDetail }) {
  const api = useInstructorApi()
  const [params, setParams] = useSearchParams()
  const requestedContext = params.get('session') ?? params.get('class')
  const loadContext = useCallback((signal: AbortSignal) => loadStudentContext(api, parseEntityId(requestedContext, 'event'), signal), [api, requestedContext])
  const context = useInstructorQuery(`student-context:${requestedContext}`, loadContext, !!requestedContext)
  const linkedContext = context.data?.roster.some(entry => entry.student.student.id === detail.student.id) ? context.data : null
  const roster = linkedContext?.roster ?? []
  const position = roster.findIndex(entry => entry.student.student.id === detail.student.id)
  const previous = roster[position - 1]?.student
  const next = roster[position + 1]?.student
  const profile = directoryStudent(detail, singaporeToday())
  const tab = params.get('tab')
  const activeTab: DetailTab = tab === 'sessions' || tab === 'grading' ? tab : 'overview'
  const sidebarRef = useRef<HTMLElement>(null)
  const [sidebarFits, setSidebarFits] = useState(false)
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    const update = () => setSidebarFits(sidebar.getBoundingClientRect().height <= window.innerHeight - 32)
    const observer = new ResizeObserver(update)
    observer.observe(sidebar)
    window.addEventListener('resize', update)
    update()
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [])
  function selectTab(value: DetailTab) {
    setParams(current => { const next = new URLSearchParams(current); next.set('tab', value); return next }, { replace: true })
  }
  const contextHref = (id: string) => {
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', activeTab)
    return `/instructor/students/${id}?${nextParams}`
  }
  const backHref = linkedContext ? `/instructor/calendar?session=${linkedContext.session.event.id}&date=${toSingaporeDateTime(linkedContext.session.event.starts_at).date}` : '/instructor/students'
  return <section className="student-detail-view space-y-2 md:space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 max-w-full items-center justify-between gap-2 max-md:w-full">
        <Button render={<Link to={backHref} />} nativeButton={false} variant="ghost" className="-ml-5 max-w-full min-w-0 max-md:h-auto max-md:min-h-11 max-md:shrink max-md:py-2">
          <ChevronLeft aria-hidden="true" /><h1 className="min-w-0 text-left whitespace-normal md:hidden">{profile.name}</h1>
          <span className="hidden md:inline">{linkedContext ? 'Back to calendar' : 'Back to students'}</span>
        </Button>
      </div>
      {roster.length > 1 && <div className="flex flex-wrap items-center gap-2 sm:gap-3" role="group" aria-label="Students in this class">
        <Button render={previous ? <Link to={contextHref(previous.student.id)} /> : undefined} nativeButton={!previous} variant="outline" size="touch" disabled={!previous}><ChevronLeft aria-hidden="true" />Previous</Button>
        <span className="text-xs text-muted-foreground tabular-nums">Student {position + 1} of {roster.length}</span>
        <Button render={next ? <Link to={contextHref(next.student.id)} /> : undefined} nativeButton={!next} variant="outline" size="touch" disabled={!next}>Next<ChevronRight aria-hidden="true" /></Button>
      </div>}
    </div>
    {requestedContext && (context.status !== 'success' ? <InstructorDataStatus loading={context.status === 'loading'} error={context.error} onRetry={context.retry} />
      : !linkedContext && <p role="status" className="detail-meta text-sm text-muted-foreground">The selected session is unavailable or this student is not on its roster.</p>)}
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside ref={sidebarRef} className={cn('order-2 min-w-0 max-md:hidden lg:order-1', sidebarFits && 'lg:sticky lg:top-4')}>
        <section aria-label="Student details" className="hidden space-y-4 md:block">
          <div><h1 className="text-xl font-semibold">{profile.name}</h1><p className="detail-meta mt-1 text-sm text-muted-foreground">{profile.memberNo}</p></div>
          <StudentInformationCards detail={detail} /><StudentInformationActions detail={detail} />
        </section>
      </aside>
      <Tabs value={activeTab} onValueChange={value => { if (value === 'overview' || value === 'sessions' || value === 'grading') selectTab(value) }} className="order-1 min-w-0 gap-6 md:gap-4 max-md:order-1 lg:order-2">
        <TabsList aria-label="Student training details" className="w-full" touch><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="sessions">Sessions</TabsTrigger><TabsTrigger value="grading">Grading</TabsTrigger></TabsList>
        <TabsContent value="overview" className="space-y-6">
          <section aria-label="Student details" className="detail-section md:hidden"><div className="detail-section-header"><h2>Details</h2></div>
            <p className="detail-meta text-sm text-muted-foreground">{profile.memberNo}</p><StudentInformationCards detail={detail} /><StudentInformationActions detail={detail} />
          </section>
          <AttendanceSummary studentId={detail.student.id} /><RecentFeedback studentId={detail.student.id} onViewSessions={() => selectTab('sessions')} />
          <GradingReadPlaceholder title="Next grading" />
        </TabsContent>
        <TabsContent value="sessions"><StudentSessionHistory studentId={detail.student.id} contextId={linkedContext?.session.event.id} /></TabsContent>
        <TabsContent value="grading" className="space-y-6"><GradingReadPlaceholder title="Grading eligibility" /><GradingReadPlaceholder title="Grading history" /></TabsContent>
      </Tabs>
    </div>
  </section>
}

export default function InstructorStudentDetails() {
  const api = useInstructorApi()
  const { session } = useAuth()
  const { studentId } = useParams()
  const load = useCallback((signal: AbortSignal) => api.getStudentDetail(parseEntityId(studentId, 'student'), signal), [api, studentId])
  const detail = useInstructorQuery(`student-detail:${studentId}`, load)
  if (detail.status !== 'success') return <section className="student-detail-view space-y-4">
    <Button render={<Link to="/instructor/students" />} nativeButton={false} variant="outline"><ChevronLeft aria-hidden="true" />Back to students</Button>
    <InstructorDataStatus loading={detail.status === 'loading'} error={detail.error} onRetry={detail.retry} />
  </section>
  if (!detail.data) return <section className="student-detail-view space-y-4">
    <Button render={<Link to="/instructor/students" />} nativeButton={false} variant="outline"><ChevronLeft aria-hidden="true" />Back to students</Button>
    <h1 className="text-2xl font-semibold">Student not found</h1><p className="text-sm text-muted-foreground">This student record is unavailable.</p>
  </section>
  return <StudentDetailContent key={`${session?.user.id}:${detail.data.student.id}`} detail={detail.data} />
}
