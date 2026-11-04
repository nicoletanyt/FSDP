import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/admin/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/admin/format'
import { supabase } from '@/lib/supabase'

interface GradingSend {
  id: string
  grading_event_id: string
  status: 'pending' | 'accepted' | 'failed'
  recipient_count: number
  created_at: string
  error: string | null
}

export default function Notifications() {
  const [history, setHistory] = useState<GradingSend[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('grading_email_sends')
      .select('id,grading_event_id,status,recipient_count,created_at,error')
      .order('created_at', { ascending: false })
    if (queryError) setError('Unable to load invitation history.')
    else {
      setHistory(data ?? [])
      setError('')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Review grading invitation requests sent through EmailJS." />
      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b border-border py-4">
          <CardTitle>Grading invitations</CardTitle>
          <CardDescription>
            Accepted means EmailJS accepted the request; it does not confirm delivery to individual BCC recipients.
            Preview and confirm one send from Grading → Eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}
          <Table>
            <TableCaption className="sr-only">EmailJS grading invitation history</TableCaption>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Grading event</TableHead>
              <TableHead>BCC addresses</TableHead>
              <TableHead>Request status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {history.map((send) => (
                <TableRow key={send.id}>
                  <TableCell>{formatDate(send.created_at.slice(0, 10))}</TableCell>
                  <TableCell className="font-mono text-xs">{send.grading_event_id}</TableCell>
                  <TableCell>{send.recipient_count}</TableCell>
                  <TableCell>
                    <span className={send.status === 'failed' ? 'text-destructive' : send.status === 'accepted' ? 'text-success' : 'text-muted-foreground'}>
                      {send.status}
                    </span>
                    {send.error && <p className="text-xs text-destructive">{send.error}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {history.length === 0 && !error && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No grading invitations recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
