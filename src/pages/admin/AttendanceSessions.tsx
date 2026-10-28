import { useMemo, useState } from 'react'
import { CalendarPlus, ExternalLink, Plus } from 'lucide-react'
import { Link } from 'react-router'
import EmptyState from '@/components/admin/EmptyState'
import SessionFormDialog from '@/components/admin/SessionFormDialog'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { getSessionAttendanceSummary } from '@/lib/admin/analytics'
import { formatDate, formatWeekday, todayIso } from '@/lib/admin/format'

type View = 'upcoming' | 'recent'

export default function AttendanceSessions() {
  const { centres, instructors, sessions, attendance } = useAdminData()
  const { centreId } = useAdminFilters()
  const [view, setView] = useState<View>('upcoming')
  const [dialogOpen, setDialogOpen] = useState(false)

  const today = todayIso()
  const scoped = sessions.filter(
    (session) => centreId === 'all' || session.centreId === centreId,
  )
  const visible = useMemo(() => {
    const filtered =
      view === 'upcoming'
        ? scoped.filter((session) => session.date >= today)
        : scoped.filter((session) => session.date <= today)
    return filtered.sort((left, right) =>
      view === 'upcoming'
        ? `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`)
        : `${right.date}T${right.startTime}`.localeCompare(`${left.date}T${left.startTime}`),
    )
  }, [scoped, view, today])

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))
  const instructorNames = new Map(
    instructors.map((instructor) => [
      instructor.id,
      `${instructor.firstName} ${instructor.lastName}`,
    ]),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant={view === 'upcoming' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('upcoming')}
          >
            Upcoming
          </Button>
          <Button
            variant={view === 'recent' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('recent')}
          >
            Recent
          </Button>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus />
          New session
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title={view === 'upcoming' ? 'No upcoming sessions' : 'No recent sessions'}
          description={
            view === 'upcoming'
              ? 'Create the next class and assign an instructor.'
              : 'Record attendance for a session once it has taken place.'
          }
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus />
              Create session
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <Table>
              <TableCaption className="sr-only">
                {view === 'upcoming' ? 'Upcoming sessions' : 'Recent sessions'}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Centre</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Roster</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((session) => {
                  const summary = getSessionAttendanceSummary(attendance, session.id)
                  const isPast = session.date <= today
                  return (
                    <TableRow key={session.id}>
                      <TableCell>
                        <p className="font-medium">{session.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatWeekday(session.date)} · {session.startTime} ·{' '}
                          {session.durationMinutes} min
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {centreNames.get(session.centreId)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {instructorNames.get(session.instructorId)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="capitalize">{session.type}</span>
                          {session.isExternal && (
                            <StatusBadge tone="warning">External</StatusBadge>
                          )}
                        </div>
                        {session.externalLocation && (
                          <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground">
                            {session.externalLocation}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {isPast ? `${summary.total} recorded` : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {isPast ? (
                            <Button
                              variant="outline"
                              size="xs"
                              render={
                                <Link
                                  to={`/admin/attendance/register?session=${session.id}`}
                                />
                              }
                            >
                              <ExternalLink />
                              Record
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(session.date)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <SessionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultCentreId={centreId}
      />
    </div>
  )
}
