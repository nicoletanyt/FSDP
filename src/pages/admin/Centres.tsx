import { useMemo } from 'react'
import { Download, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import EmptyState from '@/components/admin/EmptyState'
import PageHeader from '@/components/admin/PageHeader'
import StudentTable from '@/components/admin/StudentTable'
import { NativeSelect } from '@/components/admin/form-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { getRiskAssessments } from '@/lib/admin/attendance-risk'
import { downloadCsv } from '@/lib/admin/export'
import { formatPercent, fullName, relativeDay } from '@/lib/admin/format'
import { getEligibilityAssessments } from '@/lib/admin/grading-eligibility'

export default function Centres() {
  const { centres, students, attendance, sessions } = useAdminData()
  const { centreId } = useAdminFilters()
  const [searchParams, setSearchParams] = useSearchParams()

  const query = searchParams.get('q') ?? ''
  const riskFilter = searchParams.get('risk') ?? 'all'
  const eligibilityFilter = searchParams.get('eligibility') ?? 'all'
  const membershipFilter = searchParams.get('membership') ?? 'all'

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  const scopedStudents = useMemo(
    () =>
      students.filter(
        (student) => centreId === 'all' || student.homeCentreId === centreId,
      ),
    [students, centreId],
  )

  const riskById = useMemo(
    () =>
      new Map(
        getRiskAssessments(scopedStudents, attendance, sessions).map((assessment) => [
          assessment.studentId,
          assessment,
        ]),
      ),
    [scopedStudents, attendance, sessions],
  )

  const eligibilityById = useMemo(
    () =>
      new Map(
        getEligibilityAssessments(scopedStudents, attendance, sessions).map(
          (assessment) => [assessment.studentId, assessment],
        ),
      ),
    [scopedStudents, attendance, sessions],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return scopedStudents
      .filter((student) => {
        if (!needle) return true
        return [fullName(student), student.memberNo, student.email].some((value) =>
          value.toLowerCase().includes(needle),
        )
      })
      .filter((student) => {
        if (riskFilter === 'all') return true
        return riskById.get(student.id)?.level === riskFilter
      })
      .filter((student) => {
        if (eligibilityFilter === 'all') return true
        return eligibilityById.get(student.id)?.status === eligibilityFilter
      })
      .filter(
        (student) =>
          membershipFilter === 'all' || student.membershipStatus === membershipFilter,
      )
      .sort((left, right) => left.firstName.localeCompare(right.firstName))
  }, [scopedStudents, query, riskFilter, eligibilityFilter, membershipFilter, riskById, eligibilityById])

  const activeFilters = [query, riskFilter, eligibilityFilter, membershipFilter].filter(
    (value) => value && value !== 'all',
  ).length

  function exportStudents() {
    downloadCsv(
      'students.csv',
      [
        'Student',
        'Member no.',
        'Centre',
        'Grade',
        'Membership',
        '30-day attendance',
        'Risk',
        'Grading eligibility',
        'Last attended',
      ],
      filtered.map((student) => {
        const risk = riskById.get(student.id)
        const eligibility = eligibilityById.get(student.id)
        return [
          fullName(student),
          student.memberNo,
          centres.find((centre) => centre.id === student.homeCentreId)?.name ?? '',
          student.currentGrade,
          student.membershipStatus,
          risk ? formatPercent(risk.rate30) : '',
          risk?.level ?? '',
          eligibility?.status ?? '',
          relativeDay(risk?.lastAttended ?? ''),
        ]
      }),
    )
  }

  const eligible = [...eligibilityById.values()].filter(
    (assessment) => assessment.status === 'eligible',
  ).length
  const declining = [...riskById.values()].filter(
    (assessment) => assessment.level === 'at_risk' || assessment.level === 'critical',
  ).length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Monitor"
        title="Centres"
        description="Students across every centre, with attendance health and grading eligibility in one view."
        actions={
          <Button variant="outline" onClick={exportStudents}>
            <Download />
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Students" value={`${scopedStudents.length}`} />
        <SummaryTile label="Declining attendance" value={`${declining}`} tone="text-destructive" />
        <SummaryTile label="Eligible to grade" value={`${eligible}`} tone="text-success" />
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => updateParam('q', event.target.value)}
                placeholder="Search by name, member number, or email"
                aria-label="Search students"
                className="h-8 w-full rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <NativeSelect
                value={riskFilter}
                onChange={(event) => updateParam('risk', event.target.value)}
                aria-label="Filter by attendance risk"
              >
                <option value="all">All risk levels</option>
                <option value="critical">Critical</option>
                <option value="at_risk">At risk</option>
                <option value="watch">Watch</option>
                <option value="healthy">Healthy</option>
              </NativeSelect>
              <NativeSelect
                value={eligibilityFilter}
                onChange={(event) => updateParam('eligibility', event.target.value)}
                aria-label="Filter by grading eligibility"
              >
                <option value="all">All eligibility</option>
                <option value="eligible">Eligible</option>
                <option value="almost">Almost</option>
                <option value="not_eligible">Not eligible</option>
              </NativeSelect>
              <NativeSelect
                value={membershipFilter}
                onChange={(event) => updateParam('membership', event.target.value)}
                aria-label="Filter by membership"
              >
                <option value="all">All memberships</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="pending">Pending</option>
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              Showing {filtered.length} of {scopedStudents.length} students
              {activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters === 1 ? '' : 's'} active` : ''}
            </p>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSearchParams({}, { replace: true })}
              >
                <X />
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No students match these filters"
          description="Try clearing the search or choosing a different centre, risk level, or membership status."
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <StudentTable students={filtered} caption="Students matching the current filters" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  )
}
