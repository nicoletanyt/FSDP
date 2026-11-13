import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gradingEligibilityKey, loadGradingEligibility } from '@/lib/admin/section-counts'
import { ArrowRight, Bell, CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import { GradeLabelBadge } from '@/components/admin/AdminGradeBadge'
import FilterPopover, { FilterField } from '@/components/FilterPopover'
import EmptyState from '@/components/admin/EmptyState'
import EligibilityChecklist from '@/components/grading/EligibilityChecklist'
import { EligibilityBadge } from '@/components/admin/StatusBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import {
  formatDate,
  initials,
} from '@/lib/admin/format'
import {
  formatMonths,
  getGradeRequirement,
} from '@/lib/admin/grading-eligibility'
import { countSyllabusItems } from '@/lib/admin/syllabus'
import type { EligibilityRequirement, Grade, GradeTrack } from '@/lib/admin/types'
import { getGradeMeta, grades, UNRANKED } from '@/lib/admin/types'
import { supabase } from '@/lib/supabase'

function related<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

interface InvitationWording { subject: string; body: string; updated_at: string }
interface InvitationPreview {
  eligible: number
  bcc_count: number
  bcc_emails: string[]
  email_subject: string
  email_body: string
  preview_token: string
  over_limit: boolean
  send_ready: boolean
}

interface LiveEligibleStudent {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string
  centre_name: string
  current_grade: string
  target_grade: string
  track: GradeTrack
  joined_at: string
  last_graded_at: string | null
  age_years: number
  membership_months: number
  grade_months: number
  min_months: number
  max_months: number | null
  min_age_years: number | null
  min_sessions: number | null
  sessions_attended: number
  techniques: { id: string; label: string; category: string; signed: boolean }[]
}

function studentName(student: LiveEligibleStudent) {
  return `${student.first_name} ${student.last_name}`.trim()
}

function LiveGrade({ label, track }: { label: string; track: GradeTrack }) {
  return <GradeLabelBadge label={label} track={track} />
}

function liveRequirements(student: LiveEligibleStudent): EligibilityRequirement[] {
  const requirements: EligibilityRequirement[] = [
    { key: 'membership', label: 'Active membership', actual: 'Active', required: 'Active', met: true },
    { key: 'membership-length', label: 'Time as a member', actual: formatMonths(student.membership_months), required: formatMonths(3), met: true },
  ]
  if (student.min_age_years !== null) requirements.push({ key: 'age', label: 'Minimum age',
    actual: `${student.age_years} years`, required: `${student.min_age_years} years`, met: true })
  if (student.min_months > 0) requirements.push({ key: 'time',
    label: student.current_grade === UNRANKED ? 'Practice since joining' : 'Time in current grade',
    actual: formatMonths(student.grade_months), required: formatMonths(student.min_months, student.max_months ?? undefined), met: true })
  if (student.min_sessions !== null) requirements.push({ key: 'sessions', label: 'Training sessions since last grading',
    actual: String(student.sessions_attended), required: String(student.min_sessions), met: true })
  if (student.techniques.length) requirements.push({ key: 'techniques', label: 'Target-grade techniques signed off',
    actual: String(student.techniques.filter(item => item.signed).length), required: String(student.techniques.length), met: true })
  requirements.push({ key: 'fees', label: 'Fees up to date', actual: 'Clear', required: 'Clear', met: true })
  return requirements
}

const requiredPlaceholders = [
  '{{children_grading_date}}', '{{children_application_close_date}}',
  '{{adult_grading_date}}', '{{adult_application_close_date}}',
]
const applicationUrl = 'https://fsdp-kappa.vercel.app/grading'

export default function GradingEligibility() {
  const { session } = useAuth()
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const [events, setEvents] = useState<{ id: string; name: string; track: GradeTrack }[]>([])
  const [eventId, setEventId] = useState('')
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'preview' | 'send' | null>(null)
  const [wording, setWording] = useState<InvitationWording | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [wordingError, setWordingError] = useState('')
  const [savingWording, setSavingWording] = useState(false)
  const [loadingWording, setLoadingWording] = useState(false)

  useEffect(() => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', dateStyle: 'short' }).format(new Date())
    void supabase.from('events').select('id,name,gradings!inner(track,official_schedule,application_status,grading_date,application_opens_on,application_deadline)')
      .eq('event_type', 'grading').eq('status', 'scheduled').eq('gradings.official_schedule', true).eq('gradings.application_status', 'open')
      .then(({ data, error }) => {
        if (error) { setNoticeError(true); setNotice('Unable to load persisted grading events.') }
        else setEvents((data ?? []).filter((event) => {
          const grading = related(event.gradings)
          return grading && (grading.track === 'adult' || grading.track === 'children') && grading.grading_date > today &&
            grading.application_opens_on <= today && grading.application_deadline >= today
        }).map(({ id, name, gradings }) => ({ id, name, track: related(gradings)!.track as GradeTrack })))
      })
  }, [])

  useEffect(() => {
    if (!notifyOpen) return
    let active = true
    setLoadingWording(true)
    setWording(null)
    setWordingError('')
    void supabase.from('admin_email_templates').select('subject,body,updated_at').eq('id', 'grading_invitation').single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) setWordingError('Unable to load the saved grading invitation. Close and reopen to try again.')
        else {
          setWording(data)
          setSubject(data.subject)
          setMessage(data.body)
        }
        setLoadingWording(false)
      })
    return () => { active = false }
  }, [notifyOpen])

  const eligibility = useQuery({
    queryKey: gradingEligibilityKey(session?.user.id, eventId),
    enabled: !!session,
    queryFn: () => loadGradingEligibility<LiveEligibleStudent>(eventId),
    refetchOnWindowFocus: true,
  })
  const eligible = eligibility.data ?? []
  const selectedStudent = eligible.find((student) => student.id === selectedStudentId)
  const selectedRequirements = selectedStudent ? liveRequirements(selectedStudent) : []
  const wordingChanged = !!wording && (subject !== wording.subject || message !== wording.body)
  function selectEvent(value: string) {
    setEventId(value)
    setPreview(null)
    setSelectedStudentId(null)
  }

  function changeNotifyOpen(open: boolean) {
    if (!open) {
      if (pendingAction || savingWording) return
      if (wordingChanged && !window.confirm('Discard unsaved invitation wording?')) return
      setPreview(null)
      setWordingError('')
    }
    setNotifyOpen(open)
  }

  async function saveWording() {
    if (!wording || !wordingChanged || savingWording) return
    if (!subject.trim() || subject.length > 150 || /[\r\n]/.test(subject) || !message.trim() || message.length > 5000 ||
      requiredPlaceholders.some(placeholder => !message.includes(placeholder)) ||
      message.split(applicationUrl).length !== 2 ||
      message.replace(/\{\{(?:children_grading_date|children_application_close_date|adult_grading_date|adult_application_close_date)\}\}/g, '').match(/\{\{[^}]*\}\}/)) {
      setWordingError(`Use a one-line subject, all four date placeholders, and exactly one ${applicationUrl} link.`)
      return
    }
    setSavingWording(true)
    setWordingError('')
    const { data, error } = await supabase.from('admin_email_templates')
      .update({ subject: subject.trim(), body: message }).eq('id', 'grading_invitation').eq('updated_at', wording.updated_at)
      .select('subject,body,updated_at').maybeSingle()
    if (error || !data) setWordingError(error
      ? 'Unable to save the grading invitation. Check administrator access and try again.'
      : 'This template changed elsewhere. Close and reopen it to review the latest version.')
    else {
      setWording(data)
      setSubject(data.subject)
      setPreview(null)
      setNoticeError(false)
      setNotice('Grading invitation template saved. No email was sent.')
    }
    setSavingWording(false)
  }

  async function notifyEligible(confirm: boolean) {
    if (!wording || wordingChanged || (confirm && !preview)) return
    if (confirm && !window.confirm(`Send ONE email to suroulomg@gmail.com, BCC ${preview?.bcc_count ?? 0} addresses for ${eventId ? 'this grading' : 'all open gradings'}? This includes mq07110@gmail.com. Continue?`)) return
    setPendingAction(confirm ? 'send' : 'preview')
    setNotice('')
    setNoticeError(false)
    try {
      const { data, error } = await supabase.functions.invoke('send-grading-invitation', {
        body: { event_id: eventId || null, confirm, ...(confirm ? { preview_token: preview?.preview_token } : {}) },
      })
      if (error) {
        const details = await error.context?.json?.().catch(() => null)
        throw new Error(details?.error ?? error.message)
      }
      if (confirm) {
        setNoticeError(false)
        setNotice(`EmailJS accepted one invitation send (BCC: ${data.bcc_count} addresses). This does not confirm delivery.`)
        setPreview(null)
        setNotifyOpen(false)
        void eligibility.refetch()
      } else {
        if (!data?.preview_token || !data?.email_subject || !data?.email_body) {
          throw new Error('The invitation service is not available. No email was sent.')
        }
        setPreview(data)
      }
    } catch (failure) {
      setNoticeError(true)
      setNotice(failure instanceof Error ? failure.message : 'Invitation failed.')
      if (confirm) setPreview(null)
    } finally { setPendingAction(null) }
  }

  return (
    <div className="space-y-6">
      {notice && !notifyOpen && (
        <Alert variant={noticeError ? 'destructive' : 'default'}>
          {!noticeError && <CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" size="touch" onClick={() => { setPreview(null); setNotice(''); setNotifyOpen(true) }} disabled={pendingAction !== null || savingWording}>
          <Bell />
          Notify Students
        </Button>
        <FilterPopover title="Filter students" activeCount={eventId ? 1 : 0} onReset={() => selectEvent('')}>
          <FilterField label="Grading" value={eventId} onChange={selectEvent} ariaLabel="Grading filter"
            options={[{ value: '', label: 'All eligible students' }, ...events.map((event) => ({ value: event.id, label: event.name }))]} />
        </FilterPopover>
      </div>
      <Dialog open={notifyOpen} onOpenChange={changeNotifyOpen}>
        <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>Notify Students</DialogTitle>
            <DialogDescription className="sr-only">Edit the saved grading invitation and preview students before sending.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-1">
            {notice && <Alert variant={noticeError ? 'destructive' : 'default'}>
              {!noticeError && <CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
              <AlertDescription>{notice}</AlertDescription>
            </Alert>}
            {!preview ? <>
              {wordingError && <p role="alert" className="text-sm text-destructive">{wordingError}</p>}
              {loadingWording && <p role="status" className="text-sm text-muted-foreground">Loading saved invitation…</p>}
              <div className="space-y-2"><Label htmlFor="invitation-subject">Subject</Label>
                <Input id="invitation-subject" value={subject} maxLength={150} disabled={loadingWording || !wording || savingWording || pendingAction !== null}
                  onChange={event => { setSubject(event.target.value); setPreview(null); setWordingError('') }} /></div>
              <div className="space-y-2"><Label htmlFor="invitation-message">Message</Label>
                <Textarea id="invitation-message" value={message} rows={11} maxLength={5000} disabled={loadingWording || !wording || savingWording || pendingAction !== null}
                  onChange={event => { setMessage(event.target.value); setPreview(null); setWordingError('') }} />
                <p className="text-xs text-muted-foreground">Keep all four grading date placeholders and exactly one {applicationUrl} link. Save changes before previewing; saving does not send email.</p>
              </div>
              <Button type="button" variant="outline" disabled={!wording || wordingChanged || pendingAction !== null || savingWording}
                onClick={() => void notifyEligible(false)}>{pendingAction === 'preview' ? 'Preparing preview…' : 'Preview students'}</Button>
            </> : <section aria-label="Email preview" className="space-y-3">
              <h3 className="font-semibold">Email preview</h3>
              <p className="font-medium">Send to {preview.eligible} {preview.eligible === 1 ? 'student' : 'students'}</p>
              <div className="rounded-md border border-border bg-background p-4">
                <p className="font-medium">{preview.email_subject}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm">{preview.email_body}</p>
              </div>
              {preview.over_limit && <p className="text-sm text-destructive">Too many BCC addresses for one send. Nothing will be sent.</p>}
              {!preview.send_ready && <p className="text-sm text-destructive">Configure the editable template in EmailJS before sending.</p>}
            </section>}
          </div>
          <DialogFooter className="items-center border-t border-border bg-popover">
            {!preview ? <>
              {wordingChanged && <span className="text-xs text-muted-foreground sm:mr-auto">Save changes before previewing or sending.</span>}
              <Button type="button" variant="outline" disabled={!wordingChanged || savingWording || pendingAction !== null} onClick={() => void saveWording()}>
                {savingWording ? 'Saving…' : 'Save'}
              </Button>
            </> : <Button type="button" variant="outline" className="sm:mr-auto" disabled={pendingAction !== null}
              onClick={() => setPreview(null)}>Edit message</Button>}
            <Button type="button" disabled={!preview || pendingAction !== null || savingWording || wordingChanged || preview.eligible === 0 || preview.over_limit || !preview.send_ready}
              onClick={() => void notifyEligible(true)}>{pendingAction === 'send' ? 'Sending…' : 'Send email'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedStudent)} onOpenChange={(open) => { if (!open) setSelectedStudentId(null) }}>
        <DialogContent className="grid-rows-[auto_minmax(0,1fr)] gap-6 overflow-hidden p-5 sm:p-6">
          {selectedStudent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{studentName(selectedStudent)}</DialogTitle>
                <DialogDescription>
                  {selectedStudent.age_years} years old · {selectedStudent.centre_name}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
                  <span className="text-xs font-medium text-muted-foreground">Grade progression</span>
                  <LiveGrade label={selectedStudent.current_grade} track={selectedStudent.track} />
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  <LiveGrade label={selectedStudent.target_grade} track={selectedStudent.track} />
                  <EligibilityBadge status="eligible" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedRequirements.length} of {selectedRequirements.length} requirements met · Last graded{' '}
                  {selectedStudent.last_graded_at ? formatDate(selectedStudent.last_graded_at) : 'never'}
                </p>
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">Requirements</h3>
                  <EligibilityChecklist key={selectedStudent.id} requirements={selectedRequirements} compact
                    techniqueDetails={selectedStudent.techniques.length ? <ul className="space-y-2">
                      {selectedStudent.techniques.map(item => <li key={item.id} className="flex items-start gap-2 text-sm">
                        {item.signed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                          : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
                        <span>{item.label} <span className="text-xs text-muted-foreground">· {item.category}</span></span>
                      </li>)}
                    </ul> : undefined} />
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {eligibility.isPending && <p role="status" className="text-sm text-muted-foreground">Loading live grading eligibility…</p>}
      {eligibility.isError && <Alert variant="destructive" role="alert"><AlertDescription className="flex items-center gap-3">
        Unable to load live eligibility. No demo students are shown.
        <Button variant="outline" size="sm" onClick={() => void eligibility.refetch()}>Retry</Button>
      </AlertDescription></Alert>}
      {eligibility.isSuccess && (eligible.length === 0 ? (
        <EmptyState
          title="No eligible students"
          description={eventId ? 'No live students currently meet all requirements for this open grading.' : 'No live students currently meet all requirements for an open official grading.'}
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <Table className="[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5">
              <TableCaption className="sr-only">
                Grading eligibility assessments
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Next grade</TableHead>
                  <TableHead className="hidden md:table-cell">Requirements</TableHead>
                  <TableHead className="hidden md:table-cell">Last graded</TableHead>
                   <TableHead className="hidden md:table-cell">Status</TableHead>
                   <TableHead className="text-right">
                     <span className="sr-only">Details</span>
                     <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
                       <span className="hidden md:inline">Eligible now</span> <span className="tabular-nums">{eligible.length}</span>
                     </span>
                   </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.map((student) => {
                  const requirements = liveRequirements(student)
                  return (
                    <TableRow
                      key={student.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedStudentId(student.id)}
                    >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                               {initials(student.first_name, student.last_name)}
                            </span>
                            <div>
                               <p className="font-medium">{studentName(student)}</p>
                               <p className="text-xs text-muted-foreground">
                                 {student.age_years} years old
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                             <LiveGrade label={student.current_grade} track={student.track} />
                             <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                             <LiveGrade label={student.target_grade} track={student.track} />
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <span className="font-medium tabular-nums">
                               {requirements.length}/{requirements.length}
                            </span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                 className="h-full w-full rounded-full bg-success"
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                           {student.last_graded_at ? formatDate(student.last_graded_at) : 'Never'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                           <EligibilityBadge status="eligible" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                             aria-label={`View eligibility details for ${studentName(student)}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedStudentId(student.id)
                            }}
                          >
                            <span className="hidden md:inline">View details</span>
                            <ChevronRight className="size-4" aria-hidden="true" />
                          </Button>
                        </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
       ))}

      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle>Eligibility rules</CardTitle>
          <CardDescription>
            Applied automatically to every student. Months are time in the
            current grade, not cumulative; technique sign-offs cover only the
            target grade’s row. Source: Aikido Shinju-Kai grading information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <RuleList title="Adult grading" track="adult" />
            <RuleList title="Children's grading" track="children" />
          </div>
          <ul className="grid gap-1 border-t border-border pt-3 text-sm text-muted-foreground">
            <li>• Member for at least 3 months, with no outstanding fees.</li>
            <li>
              • Every technique in the target grade’s syllabus row must be signed
              off before a student can be invited.
            </li>
            <li>• Applications close 14 days before the grading.</li>
            <li>
              • Ages are calendar-year (“by year”), and students move to the
              adult syllabus at 13. A Junior Dan holder restarts the 9-month
              1st Dan clock at the Junior Dan award, so the wait is longer than
              the direct path.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function requirementText(grade: Grade, track: GradeTrack): string {
  const requirement = getGradeRequirement(grade, track)
  if (!requirement) return '—'
  const parts: string[] = []
  if (requirement.minAge !== undefined) parts.push(`age ${requirement.minAge}+`)
  if (requirement.maxAge !== undefined) parts.push(`age ≤${requirement.maxAge}`)
  if (requirement.minMonths > 0) {
    parts.push(formatMonths(requirement.minMonths, requirement.maxMonths))
  }
  if (requirement.sessions !== undefined) parts.push(`${requirement.sessions} sessions`)
  const syllabusCount = countSyllabusItems(grade, track)
  if (syllabusCount > 0) parts.push(`${syllabusCount} techniques`)
  return parts.join(' · ')
}

function RuleList({ title, track }: { title: string; track: GradeTrack }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <dl className="mt-2 space-y-1 text-sm">
        {grades
          .filter((grade) => getGradeMeta(grade)?.tracks.includes(track))
          .map((grade) => (
            <div
              key={grade}
              className="flex items-center justify-between gap-3"
            >
              <dt><GradeLabelBadge label={grade} track={track} /></dt>
              <dd className="shrink-0 text-right tabular-nums">
                {requirementText(grade, track)}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  )
}
