import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/admin/EmptyState'
import { StatusBadge } from '@/components/admin/StatusBadge'
import type { BadgeTone } from '@/components/admin/StatusBadge'
import FilterPopover, { FilterField } from '@/components/FilterPopover'
import SearchInput from '@/components/SearchInput'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/admin/format'
import { supabase } from '@/lib/supabase'

type SendStatus = 'pending' | 'accepted' | 'failed'

interface GradingSend {
  id: string
  grading_event_id: string | null
  event_name: string | null
  status: SendStatus
  recipient_count: number
  created_at: string
  error: string | null
}

interface AttendanceSend {
  id: string
  student_id: string
  status: SendStatus
  created_at: string
  error: string | null
  students: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
}

type SentEmail = {
  id: string
  date: string
  type: 'grading' | 'attendance'
  sentTo: string
  status: SendStatus
  error: string | null
}

const typeLabels = { grading: 'Grading invitation', attendance: 'Attendance notice' } as const

// "Accepted" means the email service took the request; for the admin that is "Sent".
const statusLabels: Record<SendStatus, { label: string; tone: BadgeTone }> = {
  accepted: { label: 'Sent', tone: 'success' },
  pending: { label: 'Sending', tone: 'warning' },
  failed: { label: 'Error', tone: 'danger' },
}

const tableClass = '[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5'

export default function Notifications() {
  const [emails, setEmails] = useState<SentEmail[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')

  const refresh = useCallback(async () => {
    const [grading, attendance] = await Promise.all([
      supabase.from('grading_email_sends')
        .select('id,grading_event_id,event_name,status,recipient_count,created_at,error')
        .order('created_at', { ascending: false }),
      supabase.from('admin_attendance_email_sends')
        .select('id,student_id,status,created_at,error,students(first_name,last_name)')
        .order('created_at', { ascending: false }).limit(100),
    ])
    if (grading.error || attendance.error) {
      setError('Sent emails could not be loaded. Check your connection and refresh the page.')
      return
    }
    const gradingRows = ((grading.data ?? []) as GradingSend[]).map((send): SentEmail => ({
      id: `grading-${send.id}`, date: send.created_at, type: 'grading', status: send.status, error: send.error,
      sentTo: `${send.event_name ?? 'A former grading'} · ${send.recipient_count} ${send.recipient_count === 1 ? 'student' : 'students'}`,
    }))
    const attendanceRows = ((attendance.data ?? []) as AttendanceSend[]).map((send): SentEmail => {
      const student = Array.isArray(send.students) ? send.students[0] : send.students
      return { id: `attendance-${send.id}`, date: send.created_at, type: 'attendance', status: send.status, error: send.error,
        sentTo: student ? `${student.first_name} ${student.last_name}` : 'A former student' }
    })
    setEmails([...gradingRows, ...attendanceRows].sort((left, right) => right.date.localeCompare(left.date)))
    setError('')
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (emails ?? []).filter(email =>
      (type === 'all' || email.type === type)
      && (status === 'all' || email.status === status)
      && (!needle || email.sentTo.toLowerCase().includes(needle)))
  }, [emails, search, type, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchInput value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Search by student or grading" aria-label="Search sent emails" />
        <FilterPopover title="Filter emails" activeCount={[type, status].filter(value => value !== 'all').length}
          onReset={() => { setType('all'); setStatus('all') }}>
          <FilterField label="Type" value={type} onChange={setType} ariaLabel="Type filter"
            options={[{ value: 'all', label: 'All emails' },
              ...Object.entries(typeLabels).map(([value, label]) => ({ value, label }))]} />
          <FilterField label="Status" value={status} onChange={setStatus} ariaLabel="Status filter"
            options={[{ value: 'all', label: 'All statuses' },
              ...Object.entries(statusLabels).map(([value, { label }]) => ({ value, label }))]}
            renderOption={option => option.value === 'all' ? option.label
              : <StatusBadge tone={statusLabels[option.value as SendStatus].tone}>{option.label}</StatusBadge>} />
        </FilterPopover>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!error && emails === null && <p role="status" className="text-sm text-muted-foreground">Loading sent emails…</p>}
      {emails !== null && (shown.length === 0 ? (
        <EmptyState
          title={emails.length ? 'No emails match these filters' : 'No emails sent yet'}
          description={emails.length
            ? 'Try a different search or reset the filters.'
            : 'Grading invitations and attendance notices you send will appear here.'}
        />
      ) : (
        <Card className="overflow-hidden py-0"><CardContent className="overflow-x-auto px-0">
          <Table className={tableClass}>
            <TableCaption className="sr-only">Emails sent to students</TableCaption>
            <TableHeader><TableRow>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead>Sent to</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {shown.map(email => (
                <TableRow key={email.id}>
                  <TableCell className="hidden md:table-cell whitespace-nowrap">{formatDate(email.date.slice(0, 10))}</TableCell>
                  <TableCell className="hidden md:table-cell">{typeLabels[email.type]}</TableCell>
                  <TableCell>
                    {email.sentTo}
                    <span className="block text-xs text-muted-foreground md:hidden">
                      {typeLabels[email.type]}, {formatDate(email.date.slice(0, 10))}
                    </span>
                  </TableCell>
                  <TableCell>
                    {email.status === 'failed' ? (
                      // The pill opens the reason it failed.
                      <Popover>
                        <PopoverTrigger aria-label={`Error sending to ${email.sentTo}. Show details`}
                          className="cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <StatusBadge tone="danger">{statusLabels.failed.label}</StatusBadge>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 gap-1.5">
                          <PopoverTitle>This email wasn't sent</PopoverTitle>
                          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {email.error || 'No reason was recorded. Try sending it again.'}
                          </p>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <StatusBadge tone={statusLabels[email.status].tone}>{statusLabels[email.status].label}</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      ))}
    </div>
  )
}
