import { useState } from 'react'
import { Link } from 'react-router'
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdminData } from '@/lib/admin/admin-data-context'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import { fullName, todayIso } from '@/lib/admin/format'
import type { AttendanceStatus } from '@/lib/admin/types'
import { cn } from 'cn'

const statusOptions: {
  value: AttendanceStatus
  label: string
  Icon: LucideIcon
  active: string
}[] = [
  {
    value: 'present',
    label: 'Present',
    Icon: CircleCheck,
    active:
      'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900',
  },
  {
    value: 'late',
    label: 'Late',
    Icon: Clock3,
    active:
      'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900',
  },
  {
    value: 'absent',
    label: 'Absent',
    Icon: CircleX,
    active:
      'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900',
  },
  {
    value: 'excused',
    label: 'Excused',
    Icon: CircleMinus,
    active: 'bg-muted text-muted-foreground hover:bg-muted',
  },
]

function initialStatuses(
  event: AdminCalendarEvent,
  attendance: { sessionId: string; studentId: string; status: AttendanceStatus }[],
) {
  const next: Record<string, AttendanceStatus> = {}
  for (const student of event.roster) next[student.id] = 'present'
  for (const record of attendance) {
    if (record.sessionId !== event.session.id) continue
    if (record.studentId in next) next[record.studentId] = record.status
  }
  return next
}

export default function AttendanceClassDetails({
  event,
  focusStudentId,
}: {
  event: AdminCalendarEvent
  focusStudentId?: string
}) {
  const { attendance, saveAttendance } = useAdminData()
  const [statusesById, setStatusesById] = useState<Record<string, AttendanceStatus>>(
    () => initialStatuses(event, attendance),
  )

  const isFuture = event.session.date > todayIso()
  const roster = event.roster

  function persist(next: Record<string, AttendanceStatus>) {
    if (!roster.length) return
    saveAttendance(
      event.session.id,
      roster.map((student) => ({
        studentId: student.id,
        status: next[student.id] ?? 'present',
      })),
    )
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    const next = { ...statusesById, [studentId]: status }
    setStatusesById(next)
    persist(next)
  }

  function markAllPresent() {
    const next = { ...statusesById }
    for (const student of roster) next[student.id] = 'present'
    setStatusesById(next)
    persist(next)
  }

  return (
    <div className="border-t border-foreground/10 bg-background/60">
      <div className="flex items-center justify-between gap-2 p-3 text-xs">
        <h4 className="font-semibold">Attendance</h4>
        <span className="text-muted-foreground">
          {roster.length} {roster.length === 1 ? 'student' : 'students'}
        </span>
      </div>

      {roster.length ? (
        <ul
          aria-label="Student roster"
          className="max-h-80 divide-y overflow-y-auto overscroll-contain border-foreground/5 px-3"
        >
          {roster.map((student) => {
            const focused = focusStudentId === student.id
            const status = statusesById[student.id] ?? 'present'
            return (
              <li
                key={student.id}
                className={cn('py-1.5', focused && 'rounded-md bg-accent/60 px-1.5')}
              >
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <Link
                      to={`/admin/students/${student.id}`}
                      className="min-w-0 truncate rounded-sm text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {fullName(student)}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      · {student.currentGrade}
                    </span>
                  </div>
                  {isFuture ? (
                    <span
                      className="shrink-0 text-[11px] text-muted-foreground"
                      aria-label={`Attendance for ${fullName(student)} is not open yet`}
                    >
                      —
                    </span>
                  ) : (
                    <div
                      role="group"
                      aria-label={`Attendance status for ${fullName(student)}`}
                      className="flex shrink-0 items-center gap-0.5"
                    >
                      {statusOptions.map(({ value, label, Icon, active }) => {
                        const selected = status === value
                        return (
                          <Button
                            key={value}
                            variant="ghost"
                            size="icon-sm"
                            aria-pressed={selected}
                            aria-label={`Mark ${fullName(student)} ${label.toLowerCase()}${selected ? ' · selected' : ''}`}
                            title={label}
                            onClick={() => setStatus(student.id, value)}
                            className={cn(
                              'size-7 rounded-full p-0 text-muted-foreground/45 transition-colors duration-200 hover:bg-muted hover:text-foreground',
                              selected && active,
                            )}
                          >
                            <Icon aria-hidden="true" className="size-4" />
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-3 pb-3 text-[11px] text-muted-foreground">
          No students are assigned to this centre.
        </p>
      )}

      {isFuture ? (
        <p className="px-3 pt-2 pb-3 text-[11px] text-muted-foreground">
          Scheduled class · attendance can be recorded on the class day.
        </p>
      ) : (
        <div className="p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={markAllPresent}
            disabled={!roster.length}
            className="h-auto min-h-7 min-w-0 shrink py-1 whitespace-normal"
          >
            Mark all present
          </Button>
        </div>
      )}
    </div>
  )
}
