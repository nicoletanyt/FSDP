import { Fragment, useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2 } from 'lucide-react'
import EmptyState from '@/components/admin/EmptyState'
import EligibilityChecklist from '@/components/admin/EligibilityChecklist'
import TechniqueRequirementBreakdown from '@/components/admin/TechniqueRequirementBreakdown'
import { EligibilityBadge } from '@/components/admin/StatusBadge'
import { NativeSelect } from '@/components/admin/form-controls'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function GradingEligibility() {
  const { centres, students, attendance, sessions, techniqueSignOffs } =
    useAdminData()
  const { centreId } = useAdminFilters()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const [events, setEvents] = useState<{ id: string; name: string; track: GradeTrack }[]>([])
  const [eventId, setEventId] = useState('')
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [sending, setSending] = useState(false)
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
  const wordingChanged = wording !== null && (subject !== wording.subject || message !== wording.body)

  async function saveWording() {
    if (!wordingChanged) return
    if (!subject.trim() || subject.length > 150 || /[\r\n]/.test(subject) || message.length > 5000 ||
      !message.includes('{{grading_details}}') || !message.includes('{{application_url}}')) {
      setWordingError('Use a subject of up to 150 characters and a message of up to 5,000 characters containing {{grading_details}} and {{application_url}}.')
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
    setSending(true)
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
      } else {
        if (!data?.preview_token || !data?.email_subject || !data?.email_body) {
          throw new Error('The editable invitation service is not deployed yet. No email was sent.')
        }
        setPreview(data)
      }
    } catch (failure) {
      setNoticeError(true)
      setNotice(failure instanceof Error ? failure.message : 'Invitation failed.')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-4">
      {notice && (
        <Alert variant={noticeError ? 'destructive' : 'default'}>
          {!noticeError && <CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Summary label="Eligible now" value={eligible.length} tone="text-success" />

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={eventId} onChange={(event) => { setEventId(event.target.value); setPreview(null); setExpanded(null) }} aria-label="Select persisted grading event">
          <option value="">All eligible students</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </NativeSelect>
        <Button variant="outline" onClick={() => void notifyEligible(false)} disabled={!wording || wordingChanged || sending || savingWording}>
          <Bell />
          Preview students
        </Button>
      </div>
      <Card className="gap-4 p-5">
        <div><h2 className="font-semibold">Invitation wording</h2>
          <p className="text-sm text-muted-foreground">Shared by adult and children’s gradings. Save changes before previewing; saving does not send an email.</p></div>
        {wordingError && <p role="alert" className="text-sm text-destructive">{wordingError}</p>}
        <div className="space-y-2"><Label htmlFor="invitation-subject">Subject</Label>
          <Input id="invitation-subject" value={subject} maxLength={150} disabled={!wording || savingWording}
            onChange={(event) => { setSubject(event.target.value); setPreview(null); setWordingError('') }} /></div>
        <div className="space-y-2"><Label htmlFor="invitation-message">Message</Label>
          <Textarea id="invitation-message" value={message} rows={13} maxLength={5000} disabled={!wording || savingWording}
            onChange={(event) => { setMessage(event.target.value); setPreview(null); setWordingError('') }} />
          <p className="text-xs text-muted-foreground">Keep {'{{grading_details}}'} and {'{{application_url}}'} in the message. They are filled in for each send.</p></div>
        <div className="flex items-center gap-3"><Button type="button" disabled={!wordingChanged || savingWording} onClick={() => void saveWording()}>
          {savingWording ? 'Saving…' : 'Save'}
        </Button>{wordingChanged && <span className="text-xs text-muted-foreground">Unsaved changes. Save before previewing.</span>}</div>
      </Card>
      {preview && <Card className="gap-3 p-4">
        <h2 className="font-semibold">Email preview · {eventId ? events.find((event) => event.id === eventId)?.name : 'All open gradings'}</h2>
        <p>Live eligible students: {preview.eligible}. One email to suroulomg@gmail.com; {preview.bcc_count} BCC addresses (including mq07110@gmail.com).</p>
        <p className="text-xs break-all text-muted-foreground">BCC: {preview.bcc_emails.join(', ')}</p>
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-medium">{preview.email_subject}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{preview.email_body}</p>
        </div>
        {preview.over_limit && <p className="text-sm text-destructive">Too many BCC addresses for one send. Nothing will be sent.</p>}
        {!preview.send_ready && <p className="text-sm text-destructive">Configure the new editable template in EmailJS before sending. Preview and Save remain available.</p>}
        <Button disabled={sending || preview.eligible === 0 || preview.over_limit || !preview.send_ready || wordingChanged} onClick={() => void notifyEligible(true)}>Confirm one EmailJS send</Button>
      </Card>}

      {eligible.length === 0 ? (
        <EmptyState
          title="No eligible students"
          description={eventId ? 'No students currently meet all grading requirements for this grading track.' : 'No students currently meet all grading requirements.'}
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <Table>
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.map((assessment) => {
                  const student = scopedStudents.find(
                    (item) => item.id === assessment.studentId,
                  )
                  if (!student) return null
                  const isExpanded = expanded === student.id
                  const hasTechniques = assessment.requirements.some(
                    (requirement) => requirement.key === 'techniques',
                  )
                  return (
                    <Fragment key={student.id}>
                      <TableRow
                        className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => setExpanded(isExpanded ? null : student.id)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setExpanded(isExpanded ? null : student.id)
                        }}
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
                          <span className="text-muted-foreground">{student.currentGrade}</span>{' '}
                          → <span className="font-medium">{assessment.targetGrade}</span>
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
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Requirement breakdown
                              </p>
                              <div
                                className={cn(
                                  'grid gap-6',
                                  hasTechniques && 'lg:grid-cols-2',
                                )}
                              >
                                <div>
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Requirements
                                  </p>
                                  <EligibilityChecklist
                                    requirements={assessment.requirements}
                                    compact
                                  />
                                </div>
                                {hasTechniques && (
                                  <TechniqueRequirementBreakdown
                                    student={student}
                                    targetGrade={assessment.targetGrade}
                                  />
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
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

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  )
}
