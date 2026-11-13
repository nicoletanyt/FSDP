import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Download, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import AdminGradeBadge from '@/components/admin/AdminGradeBadge'
import EmptyState from '@/components/admin/EmptyState'
import { EligibilityBadge, MembershipBadge, RiskBadge, StatusBadge } from '@/components/admin/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { downloadCsv } from '@/lib/admin/export'
import { formatDate, formatPercent, initials, relativeDay } from '@/lib/admin/format'
import { loadCalendarCentres } from '@/lib/admin/live-class-calendar'
import { getGradeMeta, grades, UNRANKED } from '@/lib/admin/types'
import type { Grade, MembershipStatus, RiskLevel } from '@/lib/admin/types'
import { supabase } from '@/lib/supabase'
import { cn } from 'cn'
import FilterCombobox from '@/components/FilterCombobox'

type DirectoryStudent = {
  id: string
  member_no: string
  first_name: string
  last_name: string
  email: string
  date_of_birth: string
  home_centre_id: string
  centre_name: string
  grade: string
  membership_status: MembershipStatus
  risk_level: RiskLevel | 'unassessed'
  attendance_rate: number | null
  attended: number
  missed: number
  enrolments: number
  last_attended: string | null
  grading_status: 'eligible' | 'not_eligible' | 'no_open_gradings'
}

const studentName = (student: DirectoryStudent) => `${student.first_name} ${student.last_name}`.trim()

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className={cn('mt-1 text-xl font-semibold tabular-nums', tone)}>{value}</p>
  </div>
}

function StudentRisk({ level }: { level: DirectoryStudent['risk_level'] }) {
  return level === 'unassessed'
    ? <StatusBadge tone="neutral">Not assessed</StatusBadge>
    : <RiskBadge level={level} />
}

function GradingStatus({ status }: { status: DirectoryStudent['grading_status'] }) {
  return status === 'no_open_gradings'
    ? <StatusBadge tone="neutral">No open gradings</StatusBadge>
    : <EligibilityBadge status={status} />
}

function StudentGrade({ label }: { label: string }) {
  if (label !== UNRANKED && !grades.includes(label as (typeof grades)[number])) {
    return <span className="inline-flex rounded-md border bg-background px-2 py-0.5 text-2xs font-semibold">{label}</span>
  }
  const grade = label as Grade
  const track = getGradeMeta(grade)?.tracks.includes('adult') ? 'adult' : 'children'
  return <AdminGradeBadge grade={grade} track={track} />
}

export default function LiveStudentsTab() {
  const { session } = useAuth()
  const { centreId } = useAdminFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const [expanded, setExpanded] = useState<string | null>(null)
  const search = searchParams.get('q') ?? ''
  const risk = searchParams.get('risk') ?? 'all'
  const eligibility = searchParams.get('eligibility') ?? 'all'
  const membership = searchParams.get('membership') ?? 'all'

  const centresQuery = useQuery({
    queryKey: ['admin', 'overview', 'centres', session?.user.id],
    queryFn: ({ signal }) => loadCalendarCentres(signal),
    enabled: !!session,
  })
  const validCentre = centreId === 'all' || centresQuery.data?.some(centre => centre.id === centreId)
  const selectedCentre = validCentre && centreId !== 'all' ? centreId : null
  const directory = useQuery({
    queryKey: ['admin', 'student-directory', session?.user.id, selectedCentre],
    queryFn: async (): Promise<DirectoryStudent[]> => {
      const { data, error } = await supabase.rpc('admin_student_directory', { target_centre: selectedCentre })
      if (error) throw error
      if (!Array.isArray(data)) throw new Error('No student directory was returned.')
      return data as DirectoryStudent[]
    },
    enabled: !!session && centresQuery.isSuccess && !!validCentre,
    refetchOnWindowFocus: true,
  })
  const error = centresQuery.error ?? directory.error
  const loading = centresQuery.isPending || directory.isPending || !validCentre
  const students = !error && validCentre && directory.isSuccess ? directory.data : []

  useEffect(() => { setExpanded(null) }, [centreId])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return students.filter(student =>
      (!needle || [studentName(student), student.member_no, student.email].some(value => value.toLowerCase().includes(needle))) &&
      (risk === 'all' || student.risk_level === risk) &&
      (eligibility === 'all' || student.grading_status === eligibility) &&
      (membership === 'all' || student.membership_status === membership),
    )
  }, [students, search, risk, eligibility, membership])
  const activeFilters = [search, risk, eligibility, membership].filter(value => value && value !== 'all').length
  const attention = students.filter(student => student.risk_level === 'at_risk').length
  const eligible = students.filter(student => student.grading_status === 'eligible').length

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams)
    for (const key of ['q', 'risk', 'eligibility', 'membership']) next.delete(key)
    setSearchParams(next, { replace: true })
  }

  function exportStudents() {
    downloadCsv('students.csv',
      ['Student', 'Member no.', 'Email', 'Centre', 'Grade', 'Membership', 'Last 5 attendance', 'Risk', 'Grading eligibility', 'Last attended'],
      filtered.map(student => [studentName(student), student.member_no, student.email, student.centre_name,
        student.grade, student.membership_status, student.attendance_rate === null ? '' : formatPercent(student.attendance_rate),
        student.risk_level, student.grading_status, student.last_attended ?? '']),
    )
  }

  return <div className="space-y-4">
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
      Unable to load live students. No demo data is shown.
      <Button variant="outline" size="sm" onClick={() => { void centresQuery.refetch(); void directory.refetch() }}>Retry</Button>
    </div>}
    {loading && !error && <p role="status" className="text-sm text-muted-foreground">Loading live students…</p>}

    {!loading && !error && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Students" value={students.length} />
        <SummaryTile label="Needs attention" value={attention} tone="text-destructive" />
        <SummaryTile label="Eligible to grade" value={eligible} tone="text-success" />
      </div>

      <Card><CardContent className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={search} onChange={event => updateParam('q', event.target.value)}
              placeholder="Search by name, member number, or email" aria-label="Search students"
              className="h-10 w-full rounded-lg border border-input bg-background pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <FilterCombobox value={risk} onChange={value => updateParam('risk', value)} ariaLabel="Filter by attendance risk"
              options={[{ value: 'all', label: 'All risk levels' }, { value: 'at_risk', label: 'At risk' }, { value: 'healthy', label: 'Healthy' }, { value: 'unassessed', label: 'Not assessed' }]} />
            <FilterCombobox value={eligibility} onChange={value => updateParam('eligibility', value)} ariaLabel="Filter by grading eligibility"
              options={[{ value: 'all', label: 'All eligibility' }, { value: 'eligible', label: 'Eligible' }, { value: 'not_eligible', label: 'Not eligible' }, { value: 'no_open_gradings', label: 'No open gradings' }]} />
            <FilterCombobox value={membership} onChange={value => updateParam('membership', value)} ariaLabel="Filter by membership"
              options={[{ value: 'all', label: 'All memberships' }, { value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'pending', label: 'Pending' }]} />
          </div>
          <Button variant="outline" size="sm" onClick={exportStudents} disabled={filtered.length === 0} className="w-full shrink-0 lg:w-auto">
            <Download />Export CSV
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>Showing {filtered.length} of {students.length} students{activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters === 1 ? '' : 's'} active` : ''}</p>
          {activeFilters > 0 && <Button variant="ghost" size="xs" onClick={clearFilters}><X />Clear filters</Button>}
        </div>
      </CardContent></Card>

      {filtered.length === 0 ? <EmptyState title="No students match these filters"
        description="Try clearing the search or choosing a different centre, risk level, or membership status." /> :
        <Card className="overflow-hidden py-0"><CardContent className="px-0">
          <Table className="[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5">
            <TableCaption className="sr-only">Live students matching the current filters</TableCaption>
            <TableHeader><TableRow>
              <TableHead>Student</TableHead><TableHead>Grade</TableHead>
              <TableHead>Membership</TableHead><TableHead className="text-right">Last 5 enrolments</TableHead>
              <TableHead>Risk</TableHead><TableHead>Last attended</TableHead>
              <TableHead className="text-right"><span className="sr-only">Details</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>{filtered.map(student => {
              const isExpanded = expanded === student.id
              return <Fragment key={student.id}>
                <TableRow className="cursor-pointer" onClick={() => setExpanded(isExpanded ? null : student.id)}>
                  <TableCell><div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(student.first_name, student.last_name)}
                    </span><p className="min-w-0 truncate font-medium">{studentName(student)}</p>
                  </div></TableCell>
                  <TableCell><StudentGrade label={student.grade} /></TableCell>
                  <TableCell><MembershipBadge status={student.membership_status} /></TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{student.attendance_rate === null ? '—' : formatPercent(student.attendance_rate)}</TableCell>
                  <TableCell><StudentRisk level={student.risk_level} /></TableCell>
                  <TableCell className="text-muted-foreground">{relativeDay(student.last_attended ?? '')}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" type="button"
                    aria-label={`${isExpanded ? 'Hide' : 'View'} details for ${studentName(student)}`}
                    aria-expanded={isExpanded} aria-controls={isExpanded ? `student-directory-details-${student.id}` : undefined}
                    onClick={event => { event.stopPropagation(); setExpanded(isExpanded ? null : student.id) }}>
                    {isExpanded ? 'Hide details' : 'View details'}
                    <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} aria-hidden="true" />
                  </Button></TableCell>
                </TableRow>
                {isExpanded && <TableRow id={`student-directory-details-${student.id}`}><TableCell colSpan={7} className="bg-muted/30">
                  <dl className="grid gap-x-8 gap-y-2 whitespace-normal text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-muted-foreground">Email</dt><dd className="break-all">{student.email}</dd></div>
                    <div><dt className="text-muted-foreground">Date of birth</dt><dd>{formatDate(student.date_of_birth)}</dd></div>
                    <div><dt className="text-muted-foreground">Recent enrolments</dt><dd>{student.enrolments} completed · {student.attended} attended · {student.missed} missed</dd></div>
                    <div><dt className="text-muted-foreground">Grading</dt><dd><GradingStatus status={student.grading_status} /></dd></div>
                  </dl>
                </TableCell></TableRow>}
              </Fragment>
            })}</TableBody>
          </Table>
        </CardContent></Card>}
    </>}
  </div>
}
