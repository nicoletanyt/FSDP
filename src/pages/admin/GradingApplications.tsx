import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Download, Eye, Search } from 'lucide-react'
import EmptyState from '@/components/admin/EmptyState'
import EligibilityChecklist from '@/components/admin/EligibilityChecklist'
import { ApplicationBadge } from '@/components/admin/StatusBadge'
import { NativeSelect } from '@/components/admin/form-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { downloadCsv } from '@/lib/admin/export'
import { formatDate, fullName, initials } from '@/lib/admin/format'
import { getEligibilityForStudent } from '@/lib/admin/grading-eligibility'
import type { GradingApplication } from '@/lib/admin/types'

export default function GradingApplications() {
  const { centres, students, sessions, attendance, opportunities, applications } =
    useAdminData()
  const { centreId } = useAdminFilters()
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GradingApplication | null>(null)

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return applications
      .map((application) => ({
        application,
        student: students.find((student) => student.id === application.studentId),
        opportunity: opportunities.find(
          (opportunity) => opportunity.id === application.opportunityId,
        ),
      }))
      .filter((row) => Boolean(row.student && row.opportunity))
      .map((row) => ({
        application: row.application,
        student: row.student!,
        opportunity: row.opportunity!,
      }))
      .filter(
        ({ student, opportunity }) =>
          centreId === 'all' ||
          student.homeCentreId === centreId ||
          opportunity.centreId === centreId,
      )
      .filter(
        ({ application }) =>
          statusFilter === 'all' || application.status === statusFilter,
      )
      .filter(({ student, opportunity }) => {
        if (!needle) return true
        return [fullName(student), student.memberNo, opportunity.title].some((value) =>
          value.toLowerCase().includes(needle),
        )
      })
      .sort((left, right) => right.application.submittedAt.localeCompare(left.application.submittedAt))
  }, [applications, students, opportunities, centreId, statusFilter, query])

  const selectedStudent = selected
    ? students.find((student) => student.id === selected.studentId)
    : undefined
  const selectedOpportunity = selected
    ? opportunities.find((opportunity) => opportunity.id === selected.opportunityId)
    : undefined
  const selectedEligibility = selectedStudent
    ? getEligibilityForStudent(selectedStudent, attendance, sessions)
    : undefined

  function exportApplications() {
    downloadCsv(
      'grading-applications.csv',
      ['Student', 'Member no.', 'Centre', 'Target grade', 'Opportunity', 'Submitted', 'Status'],
      rows.map(({ application, student, opportunity }) => [
        fullName(student),
        student.memberNo,
        centreNames.get(student.homeCentreId) ?? '',
        application.targetGrade,
        opportunity.title,
        application.submittedAt.slice(0, 10),
        application.status,
      ]),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student or opportunity"
            aria-label="Search grading applications"
            className="h-8 w-full rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
        <div className="w-40">
          <NativeSelect
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by application status"
          >
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="withdrawn">Withdrawn</option>
          </NativeSelect>
        </div>
        <Button variant="outline" onClick={exportApplications} disabled={rows.length === 0}>
          <Download />
          Export CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length} applications · read-only. Grading results and promotions are outside
        this portal.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="No applications match these filters"
          description="Applications submitted through the student portal will appear here."
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <Table>
              <TableCaption className="sr-only">Grading applications</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Centre</TableHead>
                  <TableHead>Target grade</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ application, student, opportunity }) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(student.firstName, student.lastName)}
                        </span>
                        <div>
                          <p className="font-medium">{fullName(student)}</p>
                          <p className="text-xs text-muted-foreground">{student.memberNo}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {centreNames.get(student.homeCentreId)}
                    </TableCell>
                    <TableCell>{application.targetGrade}</TableCell>
                    <TableCell>
                      <p>{opportunity.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(opportunity.date)}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(application.submittedAt.slice(0, 10))}
                    </TableCell>
                    <TableCell>
                      <ApplicationBadge status={application.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setSelected(application)}
                        >
                          <Eye />
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grading application</DialogTitle>
            <DialogDescription>
              Read-only view of the student's submission.
            </DialogDescription>
          </DialogHeader>
          {selected && selectedStudent && selectedOpportunity && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initials(selectedStudent.firstName, selectedStudent.lastName)}
                </span>
                <div>
                  <p className="font-medium">{fullName(selectedStudent)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedStudent.memberNo} ·{' '}
                    {centreNames.get(selectedStudent.homeCentreId)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Info label="Target grade" value={selected.targetGrade} />
                <Info label="Status" value={<ApplicationBadge status={selected.status} />} />
                <Info label="Opportunity" value={selectedOpportunity.title} />
                <Info label="Submitted" value={formatDate(selected.submittedAt.slice(0, 10))} />
              </div>
              {selected.notes && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Student note</p>
                  <p className="mt-1">{selected.notes}</p>
                </div>
              )}
              {selectedEligibility && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current eligibility
                  </p>
                  <EligibilityChecklist
                    requirements={selectedEligibility.requirements}
                    compact
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Eligibility is shown for reference. This portal does not process grading
                results or promotions.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  )
}
