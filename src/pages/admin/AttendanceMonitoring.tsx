import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { attendanceMonitoringKey, loadAttendanceMonitoring } from '@/lib/admin/section-counts'
import { AlertTriangle, Bell, CheckCircle2, ChevronRight } from 'lucide-react'
import AttendanceNoticeDialog, { noticeResultMessage } from '@/components/admin/AttendanceNoticeDialog'
import EmptyState from '@/components/shared/layout/EmptyState'
import { RiskBadge, StatusBadge } from '@/components/shared/status/StatusBadge'
import { GradeLabelBadge } from '@/components/shared/grade/GradeBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { formatPercent, initials, relativeDay } from '@/lib/admin/format'
import { loadCalendarCentres } from '@/lib/admin/live-class-calendar'
import type { RiskLevel } from '@/lib/admin/types'
import { cn } from 'cn'
import FilterPopover, { FilterField } from '@/components/shared/filters/FilterPopover'
import SearchInput from '@/components/shared/filters/SearchInput'

type MonitoredStudent = {
  id: string
  first_name: string
  last_name: string
  member_no: string
  email: string
  centre_name: string
  grade: string
  level: RiskLevel | 'unassessed'
  enrolments: number
  attended: number
  missed: number
  rate: number | null
  last_attended: string | null
}

const name = (student: MonitoredStudent) => `${student.first_name} ${student.last_name}`.trim()

export default function AttendanceMonitoring() {
  const { session } = useAuth()
  const [centreId, setCentreId] = useState('all')
  const [levelFilter, setLevelFilter] = useState('at_risk')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [noticeStudentIds, setNoticeStudentIds] = useState<string[] | null>(null)

  const centresQuery = useQuery({
    queryKey: ['admin', 'overview', 'centres', session?.user.id],
    queryFn: ({ signal }) => loadCalendarCentres(signal),
    enabled: !!session,
  })
  const validCentre = centreId === 'all' || centresQuery.data?.some(centre => centre.id === centreId)
  const targetCentre = validCentre && centreId !== 'all' ? centreId : null
  const monitoring = useQuery({
    queryKey: attendanceMonitoringKey(session?.user.id, targetCentre),
    queryFn: () => loadAttendanceMonitoring<MonitoredStudent>(targetCentre),
    enabled: !!session && centresQuery.isSuccess && !!validCentre,
    refetchOnWindowFocus: true,
  })
  const error = centresQuery.error ?? monitoring.error
  const students = !error && validCentre && monitoring.isSuccess ? monitoring.data : []
  const loading = centresQuery.isPending || monitoring.isPending || !validCentre

  useEffect(() => { setSelected(new Set()); setExpanded(null) }, [centreId, levelFilter, search])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return students.filter(student =>
      (levelFilter === 'all' || student.level === levelFilter) &&
      (!needle || [name(student), student.member_no, student.email].some(value => value.toLowerCase().includes(needle))),
    )
  }, [students, levelFilter, search])
  const selectable = filtered.filter(student => student.level === 'at_risk')
  const visibleSelected = selectable.filter(student => selected.has(student.id)).map(student => student.id)
  const allSelected = selectable.length > 0 && selectable.every(student => selected.has(student.id))

  function toggleAll() {
    setSelected(current => {
      const next = new Set(current)
      for (const student of selectable) {
        if (allSelected) next.delete(student.id)
        else next.add(student.id)
      }
      return next
    })
  }

  function toggleOne(studentId: string) {
    if (!selectable.some(student => student.id === studentId)) return
    setSelected(current => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  function openNotice() {
    setNoticeStudentIds(visibleSelected.length ? visibleSelected : null)
    setNoticeOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden="true" />
        <p className="text-muted-foreground">Based on each student’s last five completed class enrolments, not how often they book. Two or more missed classes means at risk. With no marked results, risk is not assessed. Unmarked and excused classes do not count as attendance results.</p>
      </div>

      {notice && <Alert role="status"><CheckCircle2 className="size-4 text-success" aria-hidden="true" /><AlertDescription>{notice}</AlertDescription></Alert>}
      {error && <Alert variant="destructive" role="alert"><AlertDescription className="flex flex-wrap items-center gap-3">
        Unable to load live attendance monitoring. No demo students are shown.
        <Button variant="outline" size="sm" onClick={() => { void centresQuery.refetch(); void monitoring.refetch() }}>Retry</Button>
      </AlertDescription></Alert>}
      {loading && !error && <p role="status" className="text-sm text-muted-foreground">Loading live attendance monitoring…</p>}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Find a student" aria-label="Search monitored students" />
        <Button variant="outline" size="touch" onClick={openNotice} disabled={!!error || loading}>
          <Bell aria-hidden="true" />Follow Up
        </Button>
        {/* The watch list opens on at-risk students, so that is the default the reset restores. */}
        <FilterPopover title="Filter students"
          activeCount={(targetCentre ? 1 : 0) + (levelFilter !== 'at_risk' ? 1 : 0)}
          onReset={() => { setCentreId('all'); setLevelFilter('at_risk') }}>
          <FilterField label="Dojo" value={targetCentre ?? 'all'} onChange={setCentreId} ariaLabel="Dojo filter"
            options={[{ value: 'all', label: 'All dojos' }, ...(centresQuery.data ?? []).map(centre => ({ value: centre.id, label: centre.name }))]} />
          <FilterField label="Risk level" value={levelFilter} onChange={setLevelFilter} ariaLabel="Risk level filter"
            options={[{ value: 'at_risk', label: 'At risk' }, { value: 'all', label: 'All levels' }, { value: 'healthy', label: 'Healthy' }, { value: 'unassessed', label: 'Not assessed' }]}
            renderOption={option => option.value === 'all' ? option.label
              : option.value === 'unassessed' ? <StatusBadge tone="neutral">Not assessed</StatusBadge>
              : <RiskBadge level={option.value as RiskLevel} />} />
        </FilterPopover>
      </div>

      {noticeOpen && <AttendanceNoticeDialog centreId={targetCentre} studentIds={noticeStudentIds}
        onClose={() => setNoticeOpen(false)} onSent={result => {
          setSelected(new Set())
          setNotice(noticeResultMessage(result))
          void monitoring.refetch()
        }} />}

      {!loading && !error && (filtered.length === 0 ? <EmptyState title="No students match this view"
        description="Try a different risk level or clear the search." /> :
        <Card className="overflow-hidden py-0"><CardContent className="overflow-x-auto px-0"><Table className="[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5">
          <TableCaption className="sr-only">Live student attendance monitoring</TableCaption>
          <TableHeader><TableRow>
            <TableHead className="w-8"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={allSelected} disabled={!selectable.length}
              onChange={toggleAll} aria-label="Select all visible students needing attention" /></TableHead>
            <TableHead>Student</TableHead><TableHead>Risk</TableHead><TableHead className="hidden md:table-cell text-right">Last 5 enrolments</TableHead>
            <TableHead className="hidden md:table-cell">Last attended</TableHead><TableHead className="text-right"><span className="sr-only md:not-sr-only">Details</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>{filtered.map(student => {
            const isExpanded = expanded === student.id
            const marked = student.attended + student.missed
            return <Fragment key={student.id}>
              <TableRow className="cursor-pointer" onClick={() => setExpanded(isExpanded ? null : student.id)}>
                <TableCell onClick={event => event.stopPropagation()}><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selected.has(student.id)}
                  disabled={student.level !== 'at_risk'}
                  onChange={() => toggleOne(student.id)} aria-label={`Select ${name(student)} for an attendance notice`} /></TableCell>
                <TableCell><div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-xs font-semibold text-destructive">
                    {initials(student.first_name, student.last_name)}
                  </span><div><p className="font-medium">{name(student)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{student.centre_name} <GradeLabelBadge label={student.grade} /></p></div>
                </div></TableCell>
                <TableCell>{student.level === 'unassessed' ? <StatusBadge tone="neutral">Not assessed</StatusBadge> : <RiskBadge level={student.level} />}</TableCell>
                <TableCell className="hidden md:table-cell text-right tabular-nums">
                  <p className="font-medium">{student.rate === null ? '—' : formatPercent(student.rate)}</p>
                  <p className="text-xs text-muted-foreground">{student.attended} attended · {student.missed} missed</p>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{relativeDay(student.last_attended ?? '')}</TableCell>
                <TableCell className="text-right"><Button type="button" variant="ghost" size="sm"
                  aria-label={`${isExpanded ? 'Hide' : 'View'} attendance details for ${name(student)}`}
                  aria-expanded={isExpanded} aria-controls={isExpanded ? `monitoring-details-${student.id}` : undefined}
                  onClick={event => { event.stopPropagation(); setExpanded(isExpanded ? null : student.id) }}>
                  <span className="hidden md:inline">{isExpanded ? 'Hide details' : 'View details'}</span>
                  <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} aria-hidden="true" />
                </Button></TableCell>
              </TableRow>
              {isExpanded && <TableRow id={`monitoring-details-${student.id}`}><TableCell colSpan={6} className="bg-muted/30">
                <p className="text-sm font-medium">Attendance assessment</p>
                <p className="mt-2 text-sm md:hidden">Last attended {relativeDay(student.last_attended ?? '')}{student.rate === null ? '' : ` · ${formatPercent(student.rate)} of the last 5`}</p>
                <p className="mt-2 text-sm">{student.enrolments} completed enrolments considered · {marked} marked · {student.attended} attended · {student.missed} missed.</p>
                <p className="mt-1 text-sm text-muted-foreground">{marked === 0
                  ? 'No marked attendance in these enrolments; risk is not assessed.'
                  : student.missed >= 2 ? 'Two or more missed classes in the last five enrolments.'
                    : 'Fewer than two missed classes in the last five enrolments.'}</p>
              </TableCell></TableRow>}
            </Fragment>
          })}</TableBody>
        </Table></CardContent></Card>)}
    </div>
  )
}
