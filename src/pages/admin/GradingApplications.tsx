import { useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import EmptyState from '@/components/admin/EmptyState'
import { NativeSelect } from '@/components/admin/form-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { downloadCsv } from '@/lib/admin/export'
import { formatDate } from '@/lib/admin/format'
import { supabase } from '@/lib/supabase'

interface Application {
  id: string
  submitted_at: string
  status: string
  target_grade_id: string
  students: Student | Student[]
  gradings: { grading_date: string | null; events: Event | Event[] } | { grading_date: string | null; events: Event | Event[] }[]
}

interface Student { first_name: string; last_name: string; member_no: string; home_centre_id: string }
interface Event { name: string; centre_id: string }

function related<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

export default function GradingApplications() {
  const { centreId } = useAdminFilters()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    void supabase.from('grading_applications')
      .select('id,submitted_at,status,target_grade_id,students(first_name,last_name,member_no,home_centre_id),gradings(grading_date,events(name,centre_id))')
      .order('submitted_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) setError('Unable to load grading applications.')
        else setApplications((data ?? []) as Application[])
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return applications.map((item) => ({
      item, student: related(item.students), grading: related(item.gradings),
    })).map((row) => ({ ...row, event: related(row.grading?.events) })).filter(({ item, student, event }) => {
      return student && event && (centreId === 'all' || student.home_centre_id === centreId || event.centre_id === centreId)
        && (statusFilter === 'all' || item.status === statusFilter)
        && (!needle || [student.first_name, student.last_name, student.member_no, event.name]
          .some((value) => value.toLowerCase().includes(needle)))
    })
  }, [applications, centreId, statusFilter, query])

  function exportApplications() {
    downloadCsv('grading-applications.csv',
      ['Student', 'Member number', 'Grading', 'Grading date', 'Target grade', 'Submitted', 'Status'],
      rows.map(({ item, student, event, grading }) => [
        `${student!.first_name} ${student!.last_name}`,
        student!.member_no, event!.name,
        grading?.grading_date ?? '', item.target_grade_id,
        item.submitted_at, item.status,
      ]))
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Grading applications</h1>
        <p className="text-sm text-muted-foreground">Submitted applications from the live database. Payments are confirmed by Stripe before submission.</p></div>
      <Button variant="outline" disabled={rows.length === 0} onClick={exportApplications}><Download /> Export CSV</Button>
    </div>
    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input aria-label="Search applications" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Find student or grading" className="h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm" /></div>
      <NativeSelect className="h-10" aria-label="Filter application status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
        <option value="all">All statuses</option><option value="submitted">Submitted</option>
        <option value="under_review">Under review</option><option value="withdrawn">Withdrawn</option>
      </NativeSelect>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p className="text-sm text-muted-foreground">Loading applications…</p> : error ? null : rows.length === 0 ?
      <EmptyState title="No applications found" description="Paid applications appear here after the Stripe webhook confirms payment." /> :
      <Card className="overflow-hidden py-0"><CardContent className="overflow-x-auto px-0"><Table>
        <TableCaption className="sr-only">Persisted grading applications</TableCaption>
        <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Grading</TableHead><TableHead>Target</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(({ item, student, event, grading }) => <TableRow key={item.id}>
          <TableCell><span className="font-medium">{student!.first_name} {student!.last_name}</span>
            <span className="block text-xs text-muted-foreground">{student!.member_no}</span></TableCell>
          <TableCell>{event!.name}<span className="block text-xs text-muted-foreground">
            {grading?.grading_date ? formatDate(grading.grading_date) : '—'}</span></TableCell>
          <TableCell>{item.target_grade_id}</TableCell>
          <TableCell>{formatDate(item.submitted_at.slice(0, 10))}</TableCell>
          <TableCell className="capitalize">{item.status.replaceAll('_', ' ')}</TableCell>
        </TableRow>)}</TableBody>
      </Table></CardContent></Card>}
  </div>
}
