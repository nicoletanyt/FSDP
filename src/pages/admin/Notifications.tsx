import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/admin/format'
import { supabase } from '@/lib/supabase'

interface GradingSend {
  id: string
  grading_event_id: string | null
  event_name: string | null
  status: 'pending' | 'accepted' | 'failed'
  recipient_count: number
  created_at: string
  error: string | null
}

interface AttendanceSend {
  id: string
  student_id: string
  status: 'pending' | 'accepted' | 'failed'
  created_at: string
  error: string | null
  students: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
}

export default function Notifications() {
  const [history, setHistory] = useState<GradingSend[]>([])
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSend[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [grading, attendance] = await Promise.all([
      supabase.from('grading_email_sends')
        .select('id,grading_event_id,event_name,status,recipient_count,created_at,error')
        .order('created_at', { ascending: false }),
      supabase.from('admin_attendance_email_sends')
        .select('id,student_id,status,created_at,error,students(first_name,last_name)')
        .order('created_at', { ascending: false }).limit(100),
    ])
    if (grading.error || attendance.error) setError('Unable to load email history.')
    else {
      setHistory(grading.data ?? [])
      setAttendanceHistory((attendance.data ?? []) as AttendanceSend[])
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
      <p className="text-sm text-muted-foreground">Grading invitations and attendance notices sent by email.</p>
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
          <Table className="[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5">
            <TableCaption className="sr-only">EmailJS grading invitation history</TableCaption>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Grading event</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Request status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {history.map((send) => (
                <TableRow key={send.id}>
                  <TableCell>{formatDate(send.created_at.slice(0, 10))}</TableCell>
                  <TableCell>{send.event_name ?? send.grading_event_id ?? 'Former grading event'}</TableCell>
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
      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b border-border py-4">
          <CardTitle>Attendance notices</CardTitle>
          <CardDescription>Follow Up uses one BCC email per group; older notices may have been sent individually. History records each student included. Accepted means EmailJS accepted the request, not confirmed delivery.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table className="[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5">
            <TableCaption className="sr-only">Attendance notice send history</TableCaption>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Request status</TableHead></TableRow></TableHeader>
            <TableBody>{attendanceHistory.map(send => {
              const student = Array.isArray(send.students) ? send.students[0] : send.students
              return <TableRow key={send.id}><TableCell>{formatDate(send.created_at.slice(0, 10))}</TableCell>
                <TableCell>{student ? `${student.first_name} ${student.last_name}` : 'Former student'}</TableCell>
                <TableCell><span className={send.status === 'failed' ? 'text-destructive' : send.status === 'accepted' ? 'text-success' : 'text-muted-foreground'}>{send.status}</span>
                  {send.error && <p className="text-xs text-destructive">{send.error}</p>}</TableCell>
              </TableRow>
            })}</TableBody>
          </Table>
          {attendanceHistory.length === 0 && !error && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No attendance notices recorded yet.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
