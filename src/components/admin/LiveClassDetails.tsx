import { useQuery } from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import { Link } from 'react-router'
import AttendanceStateBadge from '@/components/shared/status/AttendanceStateBadge'
import { DatabaseGradeBadge as GradeBadge } from '@/components/shared/grade/GradeBadge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/use-auth'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import { loadClassRoster } from '@/lib/admin/live-class-calendar'
import { cn } from 'cn'
import CoverCandidatePreview from './CoverCandidatePreview'

// Same compact grade line the instructor roster uses under each name.
const rosterGradeClass = 'h-auto max-w-16 flex-nowrap rounded-none border-0 bg-transparent p-0 text-3xs text-muted-foreground lg:h-4 lg:max-w-full lg:leading-4 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate [&>span:first-child]:font-normal [&>[aria-hidden]]:h-1.5 [&>[aria-hidden]]:w-2 lg:[&>[aria-hidden]]:w-3'

/**
 * A class's details in the admin calendar, laid out like the instructor's
 * class details: an attendance count, then the roster with each student's grade
 * and recorded attendance. Admins view attendance; instructors mark it.
 */
export default function LiveClassDetails({ event, fillHeight = false }: {
  event: AdminCalendarEvent
  fillHeight?: boolean
}) {
  const { session } = useAuth()
  const details = event.liveDetails
  const roster = useQuery({
    queryKey: ['admin', session?.user.id, 'class-roster', details?.eventId],
    queryFn: ({ signal }) => loadClassRoster(details!.eventId, details!.startsAt, signal),
    enabled: Boolean(session && details), staleTime: 30_000, refetchInterval: 30_000, retry: false,
  })
  if (!details) return null
  const students = roster.data ?? []
  const marked = students.filter(student => student.attendance !== 'unmarked').length

  return (
    <div
      aria-busy={roster.isPending}
      className={cn('border-t border-foreground/10 bg-background text-foreground',
        fillHeight && 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col')}
    >
      <div className="shrink-0 space-y-2 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <h4 className="text-sm font-medium">Attendance</h4>
          <span aria-live="polite" className="text-muted-foreground">
            {roster.isSuccess ? `${marked}/${students.length} marked` : '…'}
          </span>
        </div>
      </div>
      {roster.isPending && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">Loading students…</p>}
      {roster.isError && <div role="alert" className="space-y-2 px-3 py-2">
        <p className="text-sm text-destructive">Unable to load the students for this class.</p>
        <Button variant="outline" size="sm" onClick={() => void roster.refetch()}>Retry</Button>
      </div>}
      {roster.isSuccess && !students.length && (
        <p role="status" className="p-4 text-sm text-muted-foreground">No students are registered for this session.</p>
      )}
      {roster.isSuccess && students.length > 0 && <TooltipProvider>
        <ul
          aria-label="Student roster"
          className={cn('my-2 divide-y divide-border/50 bg-muted/25 lg:overflow-y-auto lg:overscroll-contain',
            fillHeight ? 'lg:min-h-0 lg:flex-1' : 'lg:max-h-80')}
        >
          {students.map(student => (
            <li
              key={student.studentId}
              className="grid grid-cols-[minmax(0,1fr)_auto_132px] items-center gap-x-2 px-3 py-2 lg:min-h-14 lg:grid-cols-[minmax(0,1fr)_92px] lg:grid-rows-[28px_16px] lg:gap-y-0.5 lg:py-1"
            >
              <span title={student.name} className="min-w-0 truncate text-2xs font-medium">{student.name}</span>
              <div className="col-start-3 row-start-1 flex w-[132px] items-center justify-end lg:col-start-2 lg:row-span-2 lg:grid lg:w-[92px] lg:grid-cols-[60px_28px] lg:gap-1 lg:self-center">
                <AttendanceStateBadge name={student.name} value={student.attendance} />
                <Tooltip>
                  <TooltipTrigger render={
                    <Button
                      render={<Link to={`/admin/students/${student.studentId}`} />}
                      nativeButton={false}
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`View student profile for ${student.name}`}
                      className="size-11 rounded-md text-foreground/70 hover:text-foreground lg:size-7"
                    />
                  }>
                    <UserRound aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>Student profile</TooltipContent>
                </Tooltip>
              </div>
              <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-1 lg:col-start-1 lg:row-start-2">
                <GradeBadge grade={student.grade} className={rosterGradeClass} />
              </div>
            </li>
          ))}
        </ul>
      </TooltipProvider>}
      {details.unavailability?.status === 'open' && (
        <div className="shrink-0 border-t border-border/50 p-3 text-sm">
          {/* Cover can only be arranged before the class starts. */}
          {new Date(details.startsAt).getTime() > Date.now()
            ? <CoverCandidatePreview eventId={details.eventId} className={event.name}
              startsAt={details.startsAt} endsAt={details.endsAt} />
            : <p role="status" className="text-muted-foreground">
              This class has already started, so cover can no longer be arranged.
            </p>}
        </div>
      )}
    </div>
  )
}
