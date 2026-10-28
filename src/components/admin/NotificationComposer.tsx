import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { getDecliningAssessments } from '@/lib/admin/attendance-risk'
import { getEligibilityAssessments } from '@/lib/admin/grading-eligibility'
import type {
  NotificationChannel,
  NotificationTemplate,
} from '@/lib/admin/types'
import { Field, NativeSelect } from './form-controls'

export type ComposerAudience = 'eligible' | 'declining' | 'all' | 'selected'

const audienceLabels: Record<ComposerAudience, string> = {
  eligible: 'Students eligible for grading',
  declining: 'Students with declining attendance',
  all: 'All students in the selected centre',
  selected: 'Selected students',
}

const templateMessages: Record<NotificationTemplate, string> = {
  'Grading invitation':
    'You are eligible to apply for the upcoming grading opportunity. Please review the requirements and submit your application before the deadline.',
  'Attendance concern':
    'We have noticed a decline in your recent training attendance. If something is making it difficult to attend, please speak with your instructor so we can support you.',
  'General reminder':
    'This is a reminder about upcoming training and centre activities. Please check the portal for details.',
}

export default function NotificationComposer({
  initialAudience = 'eligible',
  selectedStudentId,
  centreId = 'all',
}: {
  initialAudience?: ComposerAudience
  selectedStudentId?: string
  centreId?: string
}) {
  const {
    students,
    attendance,
    sessions,
    sendNotification,
  } = useAdminData()
  const [audience, setAudience] = useState<ComposerAudience>(initialAudience)
  const [channel, setChannel] = useState<NotificationChannel>('email')
  const [template, setTemplate] = useState<NotificationTemplate>('Grading invitation')
  const [message, setMessage] = useState(templateMessages['Grading invitation'])
  const [sent, setSent] = useState(false)

  useEffect(() => {
    setAudience(initialAudience)
  }, [initialAudience])

  useEffect(() => {
    setMessage(templateMessages[template])
  }, [template])

  const centreStudents = useMemo(
    () =>
      students.filter((student) => centreId === 'all' || student.homeCentreId === centreId),
    [students, centreId],
  )

  const recipients = useMemo(() => {
    if (audience === 'all') return centreStudents
    if (audience === 'eligible') {
      const assessments = getEligibilityAssessments(centreStudents, attendance, sessions)
      return centreStudents.filter((student) =>
        assessments.some(
          (assessment) =>
            assessment.studentId === student.id && assessment.status === 'eligible',
        ),
      )
    }
    if (audience === 'declining') {
      const declining = new Set(
        getDecliningAssessments(centreStudents, attendance, sessions).map(
          (assessment) => assessment.studentId,
        ),
      )
      return centreStudents.filter((student) => declining.has(student.id))
    }
    return selectedStudentId
      ? centreStudents.filter((student) => student.id === selectedStudentId)
      : []
  }, [audience, centreStudents, attendance, sessions, selectedStudentId])

  const previewNames = recipients
    .slice(0, 3)
    .map((student) => `${student.firstName} ${student.lastName}`)
    .join(', ')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (recipients.length === 0) return
    sendNotification({
      channel,
      template,
      audience:
        audience === 'selected' && recipients[0]
          ? `Selected student — ${recipients[0].firstName} ${recipients[0].lastName}`
          : audienceLabels[audience],
      recipientCount: recipients.length,
    })
    setSent(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4 text-primary" aria-hidden="true" />
          Compose a notification
        </CardTitle>
        <CardDescription>
          Choose an audience, preview the message, and send it to students.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {sent && (
            <Alert>
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              <AlertDescription>
                Notification queued for {recipients.length}{' '}
                {recipients.length === 1 ? 'student' : 'students'}.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience" htmlFor="notification-audience">
              <NativeSelect
                id="notification-audience"
                value={audience}
                onChange={(event) => {
                  setAudience(event.target.value as ComposerAudience)
                  setSent(false)
                }}
              >
                <option value="eligible">Students eligible for grading</option>
                <option value="declining">Students with declining attendance</option>
                <option value="all">All students in the selected centre</option>
                <option value="selected">Selected students</option>
              </NativeSelect>
            </Field>
            <Field label="Channel" htmlFor="notification-channel">
              <NativeSelect
                id="notification-channel"
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value as NotificationChannel)
                  setSent(false)
                }}
              >
                <option value="email">Email</option>
                <option value="in_app">In-app</option>
              </NativeSelect>
            </Field>
          </div>

          <Field label="Template" htmlFor="notification-template">
            <NativeSelect
              id="notification-template"
              value={template}
              onChange={(event) => {
                setTemplate(event.target.value as NotificationTemplate)
                setSent(false)
              }}
            >
              <option value="Grading invitation">Grading invitation</option>
              <option value="Attendance concern">Attendance concern</option>
              <option value="General reminder">General reminder</option>
            </NativeSelect>
          </Field>

          <Field label="Message" htmlFor="notification-message">
            <Textarea
              id="notification-message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                setSent(false)
              }}
              rows={5}
              required
            />
          </Field>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {recipients.length} {recipients.length === 1 ? 'recipient' : 'recipients'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {recipients.length === 0
                ? 'No students match this audience for the selected centre.'
                : previewNames + (recipients.length > 3 ? ` and ${recipients.length - 3} more` : '')}
            </p>
          </div>

          <Button type="submit" disabled={recipients.length === 0}>
            <Send />
            Send notification
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
