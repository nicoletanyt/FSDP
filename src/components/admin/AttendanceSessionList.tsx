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
import { getSessionAttendanceSummary } from '@/lib/admin/analytics'
import { formatTime } from '@/lib/admin/attendance-calendar'
import { formatDate, formatWeekday, todayIso } from '@/lib/admin/format'

type View = 'upcoming' | 'recent'

export default function AttendanceSessionList({
  centreId,
}: {
  centreId: string
}) {
  const { instructors, sessions, attendance } = useAdminData()
  const [view, setView] = useState<View>('upcoming')
  const [dialogOpen, setDialogOpen] = useState(false)

  const today = todayIso()
  const visible = useMemo(() => {
    const scoped = sessions.filter((session) => session.centreId === centreId)
    const filtered =
      view === 'upcoming'
        ? scoped.filter((session) => session.date >= today)
        : scoped.filter((session) => session.date <= today)
    return filtered.sort((left, right) =>
      view === 'upcoming'
        ? `${left.date}T${left.startTime}`.localeCompare(
            `${right.date}T${right.startTime}`,
          )
        : `${right.date}T${right.startTime}`.localeCompare(
            `${left.date}T${left.startTime}`,
          ),
    )
  }, [sessions, centreId, view, today])

  const instructorNames = new Map(
    instructors.map((instructor) => [
      instructor.id,
      `${instructor.firstName} ${instructor.lastName}`,
    ]),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant={view === 'upcoming' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={view === 'upcoming'}
            onClick={() => setView('upcoming')}
          >
            Upcoming
          </Button>
          <Button
            variant={view === 'recent' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={view === 'recent'}
            onClick={() => setView('recent')}
          >
            Recent
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            New session
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title={
              view === 'upcoming' ? 'No upcoming sessions' : 'No recent sessions'
            }
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
                    <TableHead>Instructor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Roster</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((session) => {
                    const summary = getSessionAttendanceSummary(
                      attendance,
                      session.id,
                    )
                    const isPast = session.date <= today
                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <p className="font-medium">{session.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatWeekday(session.date)} ·{' '}
                            {formatTime(session.startTime)} ·{' '}
                            {session.durationMinutes} min
                          </p>
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
                                    to={`/admin/attendance/register?centre=${session.centreId}&date=${session.date}&session=${session.id}&view=week&display=list`}
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
      </div>

      <SessionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultCentreId={centreId}
      />
    </div>
  )
}
