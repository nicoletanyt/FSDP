import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Download, GraduationCap, Users, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { GradeLabelBadge } from '@/components/admin/AdminGradeBadge'
import StatCard from '@/components/admin/StatCard'
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
import type { MembershipStatus, RiskLevel } from '@/lib/admin/types'
import { supabase } from '@/lib/supabase'
import { cn } from 'cn'
import FilterPopover, { FilterField } from '@/components/FilterPopover'
import SearchInput from '@/components/SearchInput'

export type DirectoryStudent = {
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

export const studentName = (student: DirectoryStudent) => `${student.first_name} ${student.last_name}`.trim()

export function StudentRisk({ level }: { level: DirectoryStudent['risk_level'] }) {
  return level === 'unassessed'
    ? <StatusBadge tone="neutral">Not assessed</StatusBadge>
    : <RiskBadge level={level} />
}

export function GradingStatus({ status }: { status: DirectoryStudent['grading_status'] }) {
  return status === 'no_open_gradings'
    ? <StatusBadge tone="neutral">No open gradings</StatusBadge>
    : <EligibilityBadge status={status} />
}

export function StudentGrade({ label }: { label: string }) {
  return <GradeLabelBadge label={label} />
}

export const studentDirectoryKey = (userId: string | undefined, centreId: string | null) =>
  ['admin', 'student-directory', userId, centreId] as const

export async function loadStudentDirectory(centreId: string | null): Promise<DirectoryStudent[]> {
  const { data, error } = await supabase.rpc('admin_student_directory', { target_centre: centreId })
  if (error) throw error
  if (!Array.isArray(data)) throw new Error('No student directory was returned.')
  return data as DirectoryStudent[]
}

export default function LiveStudentsTab() {
  const { session } = useAuth()
  const { centreId, setCentreId } = useAdminFilters()
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
    queryKey: studentDirectoryKey(session?.user.id, selectedCentre),
    queryFn: () => loadStudentDirectory(selectedCentre),
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
  const popoverFilters = [selectedCentre, risk, eligibility, membership].filter(value => value && value !== 'all').length
  const activeFilters = popoverFilters + (search ? 1 : 0)
  const attention = students.filter(student => student.risk_level === 'at_risk').length
  const eligible = students.filter(student => student.grading_status === 'eligible').length

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  function clearFilters(keepSearch = false) {
    const next = new URLSearchParams(searchParams)
    for (const key of ['risk', 'eligibility', 'membership', ...(keepSearch ? [] : ['q'])]) next.delete(key)
    setSearchParams(next, { replace: true })
    setCentreId('all')
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
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Students" value={String(students.length)} icon={Users} />
        <StatCard label="Needs attention" value={String(attention)} icon={AlertTriangle} tone={attention ? 'danger' : 'default'} />
        <StatCard label="Eligible to grade" value={String(eligible)} icon={GraduationCap} tone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchInput value={search} onChange={event => updateParam('q', event.target.value)}
          placeholder="Search by name, member number, or email" aria-label="Search students" />
        <Button variant="outline" size="touch" onClick={exportStudents} disabled={filtered.length === 0} className="shrink-0"
          aria-label="Export CSV">
          <Download /><span className="hidden sm:inline">Export CSV</span>
        </Button>
        <FilterPopover title="Filter students" activeCount={popoverFilters} onReset={() => clearFilters(true)}>
          <FilterField label="Dojo" value={selectedCentre ?? 'all'} onChange={setCentreId} ariaLabel="Dojo filter"
            options={[{ value: 'all', label: 'All dojos' }, ...(centresQuery.data ?? []).map(centre => ({ value: centre.id, label: centre.name }))]} />
          <FilterField label="Risk" value={risk} onChange={value => updateParam('risk', value)} ariaLabel="Filter by attendance risk"
            options={[{ value: 'all', label: 'All risk levels' }, { value: 'at_risk', label: 'At risk' }, { value: 'healthy', label: 'Healthy' }, { value: 'unassessed', label: 'Not assessed' }]}
            renderOption={option => option.value === 'all' ? option.label : <StudentRisk level={option.value as DirectoryStudent['risk_level']} />} />
          <FilterField label="Eligibility" value={eligibility} onChange={value => updateParam('eligibility', value)} ariaLabel="Filter by grading eligibility"
            options={[{ value: 'all', label: 'All eligibility' }, { value: 'eligible', label: 'Eligible' }, { value: 'not_eligible', label: 'Not eligible' }, { value: 'no_open_gradings', label: 'No open gradings' }]}
            renderOption={option => option.value === 'all' ? option.label : <GradingStatus status={option.value as DirectoryStudent['grading_status']} />} />
          <FilterField label="Membership" value={membership} onChange={value => updateParam('membership', value)} ariaLabel="Filter by membership"
            options={[{ value: 'all', label: 'All memberships' }, { value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'pending', label: 'Pending' }]}
            renderOption={option => option.value === 'all' ? option.label : <MembershipBadge status={option.value as MembershipStatus} />} />
        </FilterPopover>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>Showing {filtered.length} of {students.length} students</p>
        {activeFilters > 0 && <Button variant="ghost" size="xs" onClick={() => clearFilters()}><X />Clear all</Button>}
      </div>

      {filtered.length === 0 ? <EmptyState title="No students match these filters"
        description="Try clearing the search or choosing a different centre, risk level, or membership status." /> :
        <Card className="overflow-hidden py-0"><CardContent className="px-0">
          <Table className="[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5">
            <TableCaption className="sr-only">Live students matching the current filters</TableCaption>
            <TableHeader><TableRow>
              <TableHead>Student</TableHead><TableHead className="hidden md:table-cell">Grade</TableHead>
              <TableHead className="hidden md:table-cell">Membership</TableHead><TableHead className="hidden md:table-cell text-right">Last 5 enrolments</TableHead>
              <TableHead>Risk</TableHead><TableHead className="hidden md:table-cell">Last attended</TableHead>
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
                  <TableCell className="hidden md:table-cell"><StudentGrade label={student.grade} /></TableCell>
                  <TableCell className="hidden md:table-cell"><MembershipBadge status={student.membership_status} /></TableCell>
                  <TableCell className="hidden md:table-cell text-right font-medium tabular-nums">{student.attendance_rate === null ? '—' : formatPercent(student.attendance_rate)}</TableCell>
                  <TableCell><StudentRisk level={student.risk_level} /></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{relativeDay(student.last_attended ?? '')}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" type="button"
                    aria-label={`${isExpanded ? 'Hide' : 'View'} details for ${studentName(student)}`}
                    aria-expanded={isExpanded} aria-controls={isExpanded ? `student-directory-details-${student.id}` : undefined}
                    onClick={event => { event.stopPropagation(); setExpanded(isExpanded ? null : student.id) }}>
                    <span className="hidden md:inline">{isExpanded ? 'Hide details' : 'View details'}</span>
                    <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} aria-hidden="true" />
                  </Button></TableCell>
                </TableRow>
                {isExpanded && <TableRow id={`student-directory-details-${student.id}`}><TableCell colSpan={7} className="bg-muted/30">
                  <dl className="grid gap-x-8 gap-y-2 whitespace-normal text-sm sm:grid-cols-2 lg:grid-cols-4">
                    {/* Columns hidden on phones. */}
                    <div className="md:hidden"><dt className="text-muted-foreground">Grade</dt><dd><StudentGrade label={student.grade} /></dd></div>
                    <div className="md:hidden"><dt className="text-muted-foreground">Membership</dt><dd><MembershipBadge status={student.membership_status} /></dd></div>
                    <div className="md:hidden"><dt className="text-muted-foreground">Last 5 enrolments</dt><dd>{student.attendance_rate === null ? '—' : formatPercent(student.attendance_rate)}</dd></div>
                    <div className="md:hidden"><dt className="text-muted-foreground">Last attended</dt><dd>{relativeDay(student.last_attended ?? '')}</dd></div>
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
