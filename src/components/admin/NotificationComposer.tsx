import { useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { sendTestEmail, testEmailRecipient } from '@/lib/admin/test-email'
import type { TestEmailTemplate } from '@/lib/admin/test-email'
import { Field, NativeSelect } from './form-controls'

const templateMessages: Record<TestEmailTemplate, string> = {
  grading_invitation:
    'You are eligible to apply for the upcoming grading opportunity. Please review the requirements and submit your application before the deadline.',
  attendance_concern:
    'We have noticed a decline in your recent training attendance. If something is making it difficult to attend, please speak with your instructor so we can support you.',
  general_reminder:
    'This is a reminder about upcoming training and centre activities. Please check the portal for details.',
}

export default function NotificationComposer({ onSent }: { onSent: () => void }) {
  const [template, setTemplate] = useState<TestEmailTemplate>('grading_invitation')
  const [message, setMessage] = useState(templateMessages.grading_invitation)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return
    setSending(true)
    setSent(false)
    setError('')
    try {
      await sendTestEmail(template, message.trim())
      setSent(true)
      onSent()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to send the test email.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4 text-primary" aria-hidden="true" />
          Send a test email
        </CardTitle>
        <CardDescription>
          Test mode: one email per send to {testEmailRecipient}. No student mailing list is contacted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {sent && <Alert><CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            <AlertDescription>Resend accepted the email. Delivery is pending confirmation.</AlertDescription>
          </Alert>}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <Field label="Template" htmlFor="notification-template">
            <NativeSelect id="notification-template" value={template} onChange={(event) => {
              const next = event.target.value as TestEmailTemplate
              setTemplate(next)
              setMessage(templateMessages[next])
              setSent(false)
            }}>
              <option value="grading_invitation">Grading invitation</option>
              <option value="attendance_concern">Attendance concern</option>
              <option value="general_reminder">General reminder</option>
            </NativeSelect>
          </Field>

          <Field label="Message" htmlFor="notification-message">
            <Textarea id="notification-message" value={message} onChange={(event) => {
              setMessage(event.target.value)
              setSent(false)
            }} rows={5} maxLength={5000} required />
          </Field>

          <Button type="submit" disabled={sending || !message.trim()}>
            <Send />
            {sending ? 'Sending…' : 'Send test email'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
