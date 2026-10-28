import { useMemo, useState } from 'react'
import { Bell, CalendarPlus, CheckCircle2, GraduationCap, Plus } from 'lucide-react'
import EmptyState from '@/components/admin/EmptyState'
import GradingOpportunityDialog from '@/components/admin/GradingOpportunityDialog'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { formatDate, todayIso } from '@/lib/admin/format'
import { countEligibleForOpportunity } from '@/lib/admin/grading-eligibility'

export default function GradingOpportunities() {
  const {
    centres,
    instructors,
    students,
    attendance,
    sessions,
    opportunities,
    applications,
    sendNotification,
  } = useAdminData()
  const { centreId } = useAdminFilters()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))
  const instructorNames = new Map(
    instructors.map((instructor) => [
      instructor.id,
      `${instructor.firstName} ${instructor.lastName}`,
    ]),
  )

  const scoped = useMemo(
    () =>
      opportunities
        .filter(
          (opportunity) =>
            centreId === 'all' || opportunity.centreId === centreId,
        )
        .sort((left, right) => left.date.localeCompare(right.date)),
    [opportunities, centreId],
  )
  const open = scoped.filter((opportunity) => opportunity.status === 'open')
  const past = scoped.filter((opportunity) => opportunity.status !== 'open')
  const today = todayIso()

  function notifyOpportunity(opportunityId: string) {
    const opportunity = opportunities.find((item) => item.id === opportunityId)
    if (!opportunity) return
    const count = countEligibleForOpportunity(
      students,
      attendance,
      sessions,
      opportunity.centreId,
      opportunity.targetGrades,
    )
    if (count === 0) return
    sendNotification({
      channel: 'email',
      template: 'Grading invitation',
      audience: `${opportunity.title} — eligible students`,
      recipientCount: count,
    })
    setNotice(`Grading invitation queued for ${count} eligible students.`)
  }

  return (
    <div className="space-y-4">
      {notice && (
        <Alert>
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {open.length} open · {past.length} past
        </p>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus />
          New opportunity
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Open opportunities
        </h2>
        {open.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="No open grading opportunities"
            description="Create an opportunity, assign an instructor, and notify eligible students."
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus />
                New opportunity
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {open.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                centreName={centreNames.get(opportunity.centreId) ?? '—'}
                instructorName={instructorNames.get(opportunity.instructorId) ?? '—'}
                eligibleCount={countEligibleForOpportunity(
                  students,
                  attendance,
                  sessions,
                  opportunity.centreId,
                  opportunity.targetGrades,
                )}
                applicationCount={
                  applications.filter(
                    (application) => application.opportunityId === opportunity.id,
                  ).length
                }
                onNotify={() => notifyOpportunity(opportunity.id)}
                isPast={opportunity.date < today}
              />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Past opportunities
          </h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {past.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                centreName={centreNames.get(opportunity.centreId) ?? '—'}
                instructorName={instructorNames.get(opportunity.instructorId) ?? '—'}
                eligibleCount={countEligibleForOpportunity(
                  students,
                  attendance,
                  sessions,
                  opportunity.centreId,
                  opportunity.targetGrades,
                )}
                applicationCount={
                  applications.filter(
                    (application) => application.opportunityId === opportunity.id,
                  ).length
                }
                onNotify={() => notifyOpportunity(opportunity.id)}
                isPast
              />
            ))}
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How opportunities work</CardTitle>
          <CardDescription>
            Creating an opportunity assigns an instructor and gives eligible students a
            deadline to submit their application. Applications are monitored here but
            grading results and promotions are handled outside this portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          Notifications use the selected centre filter and the target grades on each
          opportunity.
        </CardContent>
      </Card>

      <GradingOpportunityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultCentreId={centreId}
      />
    </div>
  )
}

function OpportunityCard({
  opportunity,
  centreName,
  instructorName,
  eligibleCount,
  applicationCount,
  onNotify,
  isPast,
}: {
  opportunity: {
    id: string
    title: string
    date: string
    applicationDeadline: string
    targetGrades: string[]
    status: string
  }
  centreName: string
  instructorName: string
  eligibleCount: number
  applicationCount: number
  onNotify: () => void
  isPast: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{opportunity.title}</CardTitle>
            <CardDescription>
              {centreName} · {formatDate(opportunity.date)}
            </CardDescription>
          </div>
          <StatusBadge tone={isPast ? 'neutral' : 'success'}>
            {isPast ? 'Past' : 'Open'}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <p className="text-xs text-muted-foreground">Instructor</p>
            <p className="mt-0.5 font-medium">{instructorName}</p>
          </div>
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <p className="text-xs text-muted-foreground">Apply by</p>
            <p className="mt-0.5 font-medium">{formatDate(opportunity.applicationDeadline)}</p>
          </div>
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <p className="text-xs text-muted-foreground">Eligible</p>
            <p className="mt-0.5 font-medium tabular-nums">{eligibleCount}</p>
          </div>
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <p className="text-xs text-muted-foreground">Applications</p>
            <p className="mt-0.5 font-medium tabular-nums">{applicationCount}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {opportunity.targetGrades.map((grade) => (
            <StatusBadge key={grade} tone="info">
              {grade}
            </StatusBadge>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onNotify}
          disabled={isPast || eligibleCount === 0}
        >
          <Bell />
          Notify eligible ({eligibleCount})
        </Button>
      </CardContent>
    </Card>
  )
}
