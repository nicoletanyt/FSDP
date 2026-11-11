import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bell, CheckCircle2, ChevronRight } from 'lucide-react'
import AdminGradeBadge from '@/components/admin/AdminGradeBadge'
import EmptyState from '@/components/admin/EmptyState'
import EligibilityChecklist from '@/components/admin/EligibilityChecklist'
import TechniqueRequirementBreakdown from '@/components/admin/TechniqueRequirementBreakdown'
import { EligibilityBadge } from '@/components/admin/StatusBadge'
import { NativeSelect } from '@/components/admin/form-controls'
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
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import {
  formatDate,
  fullName,
  initials,
} from '@/lib/admin/format'
import {
  formatMonths,
  getEligibilityAssessments,
  getGradeRequirement,
  studentAge,
  studentTrack,
} from '@/lib/admin/grading-eligibility'
import { countSyllabusItems } from '@/lib/admin/syllabus'
import type { Grade, GradeTrack } from '@/lib/admin/types'
import { getGradeMeta, grades } from '@/lib/admin/types'
import { cn } from 'cn'
import { supabase } from '@/lib/supabase'

function related<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

interface InvitationWording { subject: string; body: string }
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

const datePlaceholders = [
  '{{children_grading_date}}',
  '{{children_application_close_date}}',
  '{{adult_grading_date}}',
  '{{adult_application_close_date}}',
] as const
const applicationUrl = 'https://fsdp-kappa.vercel.app/grading'

export default function GradingEligibility() {
  const { centres, students, attendance, sessions, techniqueSignOffs } =
    useAdminData()
  const { centreId } = useAdminFilters()
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

  useEffect(() => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', dateStyle: 'short' }).format(new Date())
    void supabase.from('events').select('id,name,gradings!inner(track,application_status,grading_date,application_opens_on,application_deadline)')
      .eq('event_type', 'grading').eq('status', 'scheduled').eq('gradings.application_status', 'open')
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
    let active = true
    void supabase.from('grading_invitation_settings').select('subject,body').eq('id', true).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) setWordingError('Unable to load invitation wording. Refresh to try again.')
        else {
          setWording(data)
          setSubject(data.subject)
          setMessage(data.body)
        }
      })
    return () => { active = false }
  }, [])

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))
  const scopedStudents = useMemo(
    () =>
      students.filter(
        (student) => centreId === 'all' || student.homeCentreId === centreId,
      ),
    [students, centreId],
  )
  const assessments = useMemo(
    () =>
      getEligibilityAssessments(
        scopedStudents,
        attendance,
        sessions,
        techniqueSignOffs,
      ),
    [scopedStudents, attendance, sessions, techniqueSignOffs],
  )

  const selectedTrack = events.find((event) => event.id === eventId)?.track
  const eligible = assessments.filter((assessment) => assessment.status === 'eligible' && (!selectedTrack ||
    scopedStudents.some((student) => student.id === assessment.studentId && studentTrack(student) === selectedTrack)))
  const selectedStudent = scopedStudents.find((student) => student.id === selectedStudentId)
  const selectedAssessment = eligible.find((assessment) => assessment.studentId === selectedStudentId)
  const wordingChanged = wording !== null && (subject !== wording.subject || message !== wording.body)

  function changeNotifyOpen(open: boolean) {
    if (!open) {
      if (savingWording || pendingAction) return
      if (wordingChanged && !window.confirm('Discard unsaved invitation wording?')) return
      setSubject(wording?.subject ?? '')
      setMessage(wording?.body ?? '')
      setPreview(null)
      setWordingError('')
    }
    setNotifyOpen(open)
  }

  async function saveWording() {
    if (!wordingChanged) return
    if (!subject.trim() || subject.length > 150 || /[\r\n]/.test(subject) || message.length > 5000 ||
      datePlaceholders.some((placeholder) => !message.includes(placeholder)) ||
      message.split(applicationUrl).length !== 2 || message.includes('[insert actual link here]') ||
      message.includes('{{grading_details}}') || message.includes('{{application_url}}')) {
      setWordingError(`Use a subject of up to 150 characters and a message of up to 5,000 characters containing all four grading date placeholders and exactly one ${applicationUrl} link.`)
      return
    }
    setSavingWording(true)
    setWordingError('')
    setNotice('')
    const { data, error } = await supabase.from('grading_invitation_settings')
      .update({ subject: subject.trim(), body: message, updated_at: new Date().toISOString() })
      .eq('id', true).select('subject,body').single()
    if (error || !data) setWordingError('Could not save the default wording. Check administrator access and try again.')
    else {
      setWording(data)
      setSubject(data.subject)
      setPreview(null)
      setNoticeError(false)
      setNotice('Default invitation wording saved. No email was sent.')
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
      } else {
        if (!data?.preview_token || !data?.email_subject || !data?.email_body) {
          throw new Error('The editable invitation service is not deployed yet. No email was sent.')
        }
        setPreview(data)
      }
    } catch (failure) {
      setNoticeError(true)
      setNotice(failure instanceof Error ? failure.message : 'Invitation failed.')
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-72">
          <NativeSelect className="h-10" value={eventId} onChange={(event) => { setEventId(event.target.value); setPreview(null); setSelectedStudentId(null) }} aria-label="Select persisted grading event">
            <option value="">All eligible students</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </NativeSelect>
        </div>
        <Button className="ml-auto" variant="outline" onClick={() => { setNotice(''); setNotifyOpen(true) }} disabled={!wording || pendingAction !== null || savingWording}>
          <Bell />
          Notify Students
        </Button>
      </div>
      {wordingError && !wording && <p role="alert" className="text-sm text-destructive">{wordingError}</p>}
      <Dialog open={notifyOpen} onOpenChange={changeNotifyOpen}>
        <DialogContent className={cn(
          'max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl',
          preview && 'lg:max-w-6xl',
        )}>
          <DialogHeader>
            <DialogTitle>Notify Students</DialogTitle>
            <DialogDescription>
              {eventId ? events.find((event) => event.id === eventId)?.name : 'All open gradings'} · Shared invitation wording for adult and children’s gradings.
            </DialogDescription>
          </DialogHeader>
          <div className={cn('min-h-0 overflow-y-auto', preview && 'lg:grid lg:grid-cols-2 lg:gap-6 lg:overflow-hidden')}>
            <div className={cn('space-y-4 pr-1', preview && 'lg:min-h-0 lg:overflow-y-auto lg:pr-3')}>
              {notice && <Alert variant={noticeError ? 'destructive' : 'default'}>
                {!noticeError && <CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
                <AlertDescription>{notice}</AlertDescription>
              </Alert>}
              {wordingError && <p role="alert" className="text-sm text-destructive">{wordingError}</p>}
              <div className="space-y-2"><Label htmlFor="invitation-subject">Subject</Label>
                <Input id="invitation-subject" value={subject} maxLength={150} disabled={savingWording || pendingAction !== null}
                  onChange={(event) => { setSubject(event.target.value); setPreview(null); setWordingError('') }} /></div>
              <div className="space-y-2"><Label htmlFor="invitation-message">Message</Label>
                <Textarea id="invitation-message" value={message} rows={11} maxLength={5000} disabled={savingWording || pendingAction !== null}
                  onChange={(event) => { setMessage(event.target.value); setPreview(null); setWordingError('') }} />
                <p className="text-xs text-muted-foreground">Keep all four date placeholders in the message: {datePlaceholders.join(', ')}. Keep the full application link in the message; only the dates are filled in for preview and send. Save changes before previewing; saving does not send an email.</p></div>
              <Button type="button" variant="outline" disabled={wordingChanged || pendingAction !== null || savingWording} onClick={() => void notifyEligible(false)}>
                {pendingAction === 'preview' ? 'Preparing preview…' : 'Preview recipients'}
              </Button>
            </div>
            {preview && <section aria-label="Email preview" className="mt-5 space-y-3 border-t border-border pt-5 pr-1 lg:mt-0 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:py-0 lg:pl-6">
              <h3 className="font-semibold">Email preview</h3>
              <p>Live eligible students: {preview.eligible}. One email to suroulomg@gmail.com; {preview.bcc_count} BCC addresses (including mq07110@gmail.com).</p>
              <p className="text-xs break-all text-muted-foreground">BCC: {preview.bcc_emails.join(', ')}</p>
              <div className="rounded-md border border-border bg-background p-4">
                <p className="font-medium">{preview.email_subject}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm">{preview.email_body}</p>
              </div>
              {preview.over_limit && <p className="text-sm text-destructive">Too many BCC addresses for one send. Nothing will be sent.</p>}
              {!preview.send_ready && <p className="text-sm text-destructive">Configure the editable template in EmailJS before sending.</p>}
            </section>}
          </div>
          <DialogFooter className="items-center border-t border-border bg-popover">
            {wordingChanged && <span className="text-xs text-muted-foreground sm:mr-auto">Save changes before previewing or sending.</span>}
            <Button type="button" variant="outline" disabled={!wordingChanged || savingWording || pendingAction !== null} onClick={() => void saveWording()}>
              {savingWording ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" disabled={!preview || pendingAction !== null || savingWording || wordingChanged || preview.eligible === 0 || preview.over_limit || !preview.send_ready}
              onClick={() => void notifyEligible(true)}>{pendingAction === 'send' ? 'Sending…' : 'Send email'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedStudent && selectedAssessment)} onOpenChange={(open) => { if (!open) setSelectedStudentId(null) }}>
        <DialogContent className="gap-6 p-5 sm:max-w-3xl sm:p-6">
          {selectedStudent && selectedAssessment && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{fullName(selectedStudent)}</DialogTitle>
                <DialogDescription>
                  {studentAge(selectedStudent)} years old · {centreNames.get(selectedStudent.homeCentreId)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
                  <span className="text-xs font-medium text-muted-foreground">Grade progression</span>
                  <AdminGradeBadge grade={selectedStudent.currentGrade} track={studentTrack(selectedStudent)} />
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  <AdminGradeBadge grade={selectedAssessment.targetGrade} track={studentTrack(selectedStudent)} />
                  <EligibilityBadge status={selectedAssessment.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedAssessment.metCount} of {selectedAssessment.total} requirements met · Last graded{' '}
                  {selectedStudent.lastGradedAt ? formatDate(selectedStudent.lastGradedAt) : 'never'}
                </p>
                <div className={cn(
                  'grid gap-6',
                  selectedAssessment.requirements.some((requirement) => requirement.key === 'techniques') && 'lg:grid-cols-2',
                )}>
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Requirements</h3>
                    <EligibilityChecklist requirements={selectedAssessment.requirements} compact />
                  </section>
                  {selectedAssessment.requirements.some((requirement) => requirement.key === 'techniques') && (
                    <TechniqueRequirementBreakdown
                      student={selectedStudent}
                      targetGrade={selectedAssessment.targetGrade}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {eligible.length === 0 ? (
        <EmptyState
          title="No eligible students"
          description={eventId ? 'No students currently meet all grading requirements for this grading track.' : 'No students currently meet all grading requirements.'}
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
                  <TableHead>Centre</TableHead>
                  <TableHead>Next grade</TableHead>
                  <TableHead>Requirements</TableHead>
                  <TableHead>Last graded</TableHead>
                  <TableHead>
                    <span className="flex items-center gap-3">
                      Status
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
                        Eligible now <span className="tabular-nums">{eligible.length}</span>
                      </span>
                    </span>
                  </TableHead>
                  <TableHead><span className="sr-only">Details</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.map((assessment) => {
                  const student = scopedStudents.find(
                    (item) => item.id === assessment.studentId,
                  )
                  if (!student) return null
                  return (
                    <TableRow
                      key={student.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedStudentId(student.id)}
                    >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {initials(student.firstName, student.lastName)}
                            </span>
                            <div>
                              <p className="font-medium">{fullName(student)}</p>
                              <p className="text-xs text-muted-foreground">
                                {studentAge(student)} years old
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {centreNames.get(student.homeCentreId)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AdminGradeBadge grade={student.currentGrade} track={studentTrack(student)} />
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <AdminGradeBadge grade={assessment.targetGrade} track={studentTrack(student)} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium tabular-nums">
                              {assessment.metCount}/{assessment.total}
                            </span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  assessment.status === 'eligible'
                                    ? 'bg-success'
                                    : assessment.status === 'almost'
                                      ? 'bg-warning'
                                      : 'bg-destructive',
                                )}
                                style={{
                                  width: `${(assessment.metCount / assessment.total) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {student.lastGradedAt ? formatDate(student.lastGradedAt) : 'Never'}
                        </TableCell>
                        <TableCell>
                          <EligibilityBadge status={assessment.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`View eligibility details for ${fullName(student)}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedStudentId(student.id)
                            }}
                          >
                            View details
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
      )}

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
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-muted-foreground">{grade}</dt>
              <dd className="shrink-0 text-right tabular-nums">
                {requirementText(grade, track)}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  )
}
