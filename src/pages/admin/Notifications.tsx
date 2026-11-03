import { useCallback, useEffect, useState } from 'react'
import { Bell, Mail, MessageSquare } from 'lucide-react'
import NotificationComposer from '@/components/admin/NotificationComposer'
import PageHeader from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/admin/format'
import { supabase } from '@/lib/supabase'

interface Delivery {
  id: string
  template: string
  audience_label: string
  recipient_count: number
  sent_at: string | null
  created_at: string
  notification_recipients: { status: string }[]
}

interface GradingSend {
  id: string
  grading_event_id: string
  status: string
  recipient_count: number
  created_at: string
  error: string | null
}

const templates: Record<string, string> = {
  grading_invitation: 'Grading invitation',
  attendance_concern: 'Attendance concern',
  general_reminder: 'General reminder',
}

export default function Notifications() {
  const [history, setHistory] = useState<Delivery[]>([])
  const [gradingHistory, setGradingHistory] = useState<GradingSend[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const { data: sends, error: sendsError } = await supabase.from('grading_email_sends')
      .select('id,grading_event_id,status,recipient_count,created_at,error').order('created_at', { ascending: false })
    if (!sendsError) setGradingHistory(sends ?? [])
    const { data, error: queryError } = await supabase.from('notifications')
      .select('id,template,audience_label,recipient_count,sent_at,created_at,notification_recipients(status)')
      .eq('audience_label', 'Resend test email').order('created_at', { ascending: false })
    if (queryError) setError('Unable to load delivery history.')
    else {
      setError('')
      setHistory(data ?? [])
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const delivered = history.filter((item) => item.notification_recipients[0]?.status === 'delivered').length
  const failed = history.filter((item) => ['failed', 'bounced'].includes(item.notification_recipients[0]?.status ?? '')).length

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Review grading invitations accepted by EmailJS. Older Resend test-email history remains below." />
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Grading invitations</h2>
        <p className="text-sm text-muted-foreground">One EmailJS request per confirmed action. Accepted does not guarantee inbox delivery.</p>
        {gradingHistory.length === 0 ? <p className="text-sm">No grading invitations recorded.</p> : <ul className="space-y-2 text-sm">
          {gradingHistory.map((send) => <li key={send.id} className="rounded border p-3">
            {formatDate(send.created_at.slice(0, 10))} · Event {send.grading_event_id} · BCC {send.recipient_count} · <strong>{send.status}</strong>
            {send.error && <p className="text-destructive">{send.error}</p>}
          </li>)}
        </ul>}
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Test emails" value={`${history.length}`} icon={Bell} />
        <Summary label="Delivered" value={`${delivered}`} icon={Mail} />
        <Summary label="Failed or bounced" value={`${failed}`} icon={MessageSquare} tone={failed > 0 ? 'text-destructive' : 'text-success'} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <NotificationComposer onSent={() => { void refresh() }} />
        <Card className="overflow-hidden py-0">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Delivery history</CardTitle>
            <CardDescription>Resend test emails only. Status refreshes every 10 seconds.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}
            <Table>
              <TableCaption className="sr-only">Test email delivery history</TableCaption>
              <TableHeader><TableRow>
                <TableHead>Sent</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Delivery</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {history.map((item) => {
                  const status = item.notification_recipients[0]?.status ?? 'pending'
                  return <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">{formatDate((item.sent_at ?? item.created_at).slice(0, 10))}</TableCell>
                    <TableCell className="font-medium">{templates[item.template] ?? item.template}</TableCell>
                    <TableCell className="text-muted-foreground">mq07110@gmail.com</TableCell>
                    <TableCell><StatusBadge tone={status === 'delivered' ? 'success' : status === 'failed' || status === 'bounced' ? 'warning' : 'neutral'}>
                      {status === 'sent' ? 'Sent · awaiting delivery' : status}
                    </StatusBadge></TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
            {history.length === 0 && !error && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No test emails sent yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Summary({ label, value, icon: Icon, tone }: {
  label: string
  value: string
  icon: typeof Bell
  tone?: string
}) {
  return <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-4" aria-hidden="true" />
    </span>
    <div><p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  </div>
}
