import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

type RecipientCheck = {
  delivery_mode: 'bcc'
  count: number
  preview_token: string
  over_limit: boolean
  send_ready: boolean
}

export type NoticeResult = { delivery_mode: 'bcc'; status: 'accepted'; recipient_count: number; bcc_count: number }

export function noticeResultMessage(result: NoticeResult) {
  return `EmailJS accepted one attendance email (BCC: ${result.bcc_count} ${result.bcc_count === 1 ? 'address' : 'addresses'} for ${result.recipient_count} ${result.recipient_count === 1 ? 'student' : 'students'}). Acceptance does not confirm delivery.`
}

export default function AttendanceNoticeDialog({ centreId, studentIds, onClose, onSent }: {
  centreId: string | null
  studentIds: string[] | null
  onClose: () => void
  onSent: (result: NoticeResult) => void
}) {
  const { session } = useAuth()
  const template = useQuery({
    queryKey: ['admin', 'attendance-notice-template', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('admin_email_templates')
        .select('subject,body').eq('id', 'attendance_notice').single()
      if (error) throw error
      return data
    },
  })
  const recipients = useQuery({
    queryKey: ['admin', 'attendance-notice-recipients', session?.user.id, centreId, studentIds],
    enabled: !!session,
    retry: false,
    queryFn: async (): Promise<RecipientCheck> => {
      const { data, error } = await supabase.functions.invoke('send-attendance-notice', {
        body: { client_mode: 'bcc', centre_id: centreId, student_ids: studentIds, confirm: false },
      })
      if (error) {
        const details = await error.context?.json?.().catch(() => null)
        throw new Error(details?.error ?? error.message)
      }
      if (data?.delivery_mode !== 'bcc') throw new Error('Follow Up requires the BCC email service update. Sending is disabled until it is deployed.')
      if (!data.preview_token || !Array.isArray(data.recipients) || !Number.isInteger(data.count) || data.count !== data.recipients.length) {
        throw new Error('Unable to check attendance notice recipients.')
      }
      return data as RecipientCheck
    },
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendNotice() {
    const check = recipients.data
    if (busy || recipients.isFetching || !template.data || !check || !check.count || check.over_limit || !check.send_ready) return
    setBusy(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('send-attendance-notice', {
        body: { client_mode: 'bcc', centre_id: centreId, student_ids: studentIds, confirm: true, preview_token: check.preview_token },
      })
      if (invokeError) {
        const details = await invokeError.context?.json?.().catch(() => null)
        throw new Error(details?.error ?? invokeError.message)
      }
      if (data?.delivery_mode !== 'bcc' || data.status !== 'accepted' || !Number.isInteger(data.recipient_count) ||
        data.recipient_count !== check.count || !Number.isInteger(data.bcc_count) || data.bcc_count < 1 || data.bcc_count > check.count) {
        throw new Error('The email service returned an unexpected result. Check send history before trying again.')
      }
      onSent(data as NoticeResult)
      onClose()
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Unable to process attendance notices.'
      setError(message === 'Recipients or template changed. Preview again before sending.'
        ? 'Recipients or template changed. Review the updated count before sending again.' : message)
      void recipients.refetch()
      void template.refetch()
    } finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
      <DialogHeader><DialogTitle>Follow Up</DialogTitle></DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto px-1">
        {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
        {template.isPending && <p role="status" className="text-sm text-muted-foreground">Loading saved attendance notice…</p>}
        {template.isError && <Alert variant="destructive" role="alert"><AlertDescription className="flex flex-wrap items-center gap-3">
          Unable to load the saved attendance notice.
          <Button variant="outline" size="sm" onClick={() => void template.refetch()}>Retry</Button>
        </AlertDescription></Alert>}
        <div className="space-y-2"><Label htmlFor="attendance-notice-subject">Subject</Label>
          <Input id="attendance-notice-subject" value={template.data?.subject ?? ''} readOnly /></div>
        <div className="space-y-2"><Label htmlFor="attendance-notice-message">Message</Label>
          <Textarea id="attendance-notice-message" value={template.data?.body ?? ''} rows={11} readOnly />
          {recipients.isFetching || recipients.isPending
            ? <p role="status" className="text-sm text-muted-foreground">Checking eligible students…</p>
            : recipients.isError
              ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                Unable to check recipients. {recipients.error.message}
                <Button variant="outline" size="sm" onClick={() => void recipients.refetch()}>Retry</Button>
              </div>
              : <p className="text-sm font-medium">Send to {recipients.data.count} {recipients.data.count === 1 ? 'student' : 'students'}</p>}
          {recipients.data && !recipients.isFetching && !recipients.isError && <>
            {recipients.data.count === 0 && <p className="text-sm text-muted-foreground">No students currently qualify for a notice.</p>}
            {recipients.data.over_limit && <p className="text-sm text-destructive">Limit: 10 recipients per send. Select up to 10 students in Attendance Monitoring.</p>}
            {!recipients.data.send_ready && <p className="text-sm text-destructive">EmailJS is not configured for sending.</p>}
          </>}
          <p className="text-xs text-muted-foreground">Edit this wording in Email templates. One email goes to suroul29@gmail.com with students BCC'd; {'{{student_name}}'} becomes “students” for the group.</p>
        </div>
      </div>
      <DialogFooter className="items-center border-t border-border bg-popover">
        <Button type="button" disabled={busy || recipients.isFetching || recipients.isError || !template.data || !recipients.data?.count || recipients.data.over_limit || !recipients.data.send_ready}
          onClick={() => void sendNotice()}>{busy ? 'Sending…' : 'Send email'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
