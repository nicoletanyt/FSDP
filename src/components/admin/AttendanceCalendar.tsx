import { useEffect, useRef } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  UserRound,
} from 'lucide-react'
import AttendanceClassDetails from '@/components/admin/AttendanceClassDetails'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import {
  dateKey,
  fullDate,
  weekDates,
  weekLabel,
} from '@/lib/admin/attendance-calendar'
import { cn } from 'cn'

function EventCard({
  event,
  expanded,
  focusStudentId,
  onToggle,
}: {
  event: AdminCalendarEvent
  expanded: boolean
  focusStudentId?: string
  onToggle: () => void
}) {
  return (
    <Card
      size="sm"
      className="gap-0 rounded-lg border py-0 shadow-none ring-0 transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 hover:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
    >
      <Button
        variant="ghost"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`attendance-details-${event.id}`}
        aria-label={`${event.name}, ${fullDate(event.date)}, ${event.startTime} to ${event.endTime}, ${event.instructorName}, ${event.roster.length} students. ${expanded ? 'Collapse' : 'Expand'} class attendance`}
        className="h-auto w-full flex-col items-stretch gap-2 rounded-lg p-2.5 text-left whitespace-normal hover:bg-foreground/5 focus-visible:-outline-offset-2"
      >
        <span className="flex items-start justify-between gap-1 text-xs leading-snug font-semibold">
          <span className="min-w-0 wrap-break-word">{event.name}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </span>
        <div
          className={cn(
            'flex gap-2',
            expanded
              ? 'flex-row items-center justify-between'
              : 'flex-col items-start',
          )}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
            <Clock3 aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 wrap-break-word">
              {event.startTime} – {event.endTime}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
            <UserRound aria-hidden="true" className="size-3 shrink-0" />{' '}
            <span className="min-w-0 truncate">{event.instructorName}</span>
          </span>
        </div>
      </Button>
      <div
        id={`attendance-details-${event.id}`}
        aria-hidden={!expanded}
        inert={!expanded}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <AttendanceClassDetails event={event} focusStudentId={focusStudentId} />
        </div>
      </div>
    </Card>
  )
}

export default function AttendanceCalendar({
  date,
  today,
  events,
  expandedSessionId,
  focusStudentId,
  onSelectDate,
  onToggleSession,
  onToday,
  onNavigateWeek,
}: {
  date: Date
  today: Date
  events: AdminCalendarEvent[]
  expandedSessionId: string | null
  focusStudentId?: string
  onSelectDate: (date: Date) => void
  onToggleSession: (event: AdminCalendarEvent) => void
  onToday: () => void
  onNavigateWeek: (direction: number) => void
}) {
  const selectedDateButton = useRef<HTMLButtonElement>(null)
  const selectedKey = dateKey(date)

  useEffect(() => {
    selectedDateButton.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    })
  }, [selectedKey])

  const eventsFor = (day: Date) =>
    events
      .filter((event) => dateKey(event.date) === dateKey(day))
      .sort(
        (left, right) =>
          left.startTime.localeCompare(right.startTime) ||
          left.name.localeCompare(right.name),
      )

  return (
    <section
      aria-label="Weekly class calendar"
      className="flex min-h-[520px] flex-col gap-3 lg:min-h-0 lg:flex-1"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Week navigation"
            className="flex items-center gap-1"
          >
            <Button variant="outline" onClick={onToday} className="mr-1 h-9 px-3">
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Previous week"
              onClick={() => onNavigateWeek(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Next week"
              onClick={() => onNavigateWeek(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <h2 className="text-sm font-medium" aria-live="polite">
            {weekLabel(date)}
          </h2>
        </div>
      </div>

      <div
        role="group"
        aria-label="Select agenda day"
        className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:hidden"
      >
        {weekDates(date).map((day) => {
          const isSelected = dateKey(day) === selectedKey
          const isToday = dateKey(day) === dateKey(today)
          return (
            <Button
              key={dateKey(day)}
              ref={isSelected ? selectedDateButton : undefined}
              variant="outline"
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`Select and expand ${day.toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}`}
              onClick={() => onSelectDate(day)}
              className={cn(
                'h-auto cursor-pointer flex-col gap-1 px-3 py-2 transition-colors duration-200',
                isSelected && 'bg-accent hover:bg-accent',
              )}
            >
              <span className="text-[11px] font-normal">
                {day.toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                  isToday && 'bg-primary text-primary-foreground',
                )}
              >
                {fullDate(day)}
              </span>
            </Button>
          )
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border lg:flex-row lg:divide-x">
        {weekDates(date).map((day) => {
          const dayEvents = eventsFor(day)
          const isToday = dateKey(day) === dateKey(today)
          const isSelected = dateKey(day) === selectedKey
          return (
            <section
              key={dateKey(day)}
              aria-label={day.toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              className={cn(
                'min-h-0 min-w-0 grow flex-col bg-card transition-[flex-basis,flex-grow,background-color,box-shadow] duration-200 ease-in-out motion-reduce:transition-none lg:shrink-0',
                isSelected ? 'flex' : 'hidden lg:flex',
                isSelected
                  ? 'bg-accent/60 lg:grow-0 lg:basis-[clamp(300px,24vw,320px)]'
                  : 'lg:grow lg:basis-0',
              )}
              data-selected={isSelected}
            >
              <header
                className={cn(
                  'h-20 shrink-0 border-b p-2 transition-colors duration-200',
                  isSelected && 'bg-accent/70',
                )}
              >
                <Button
                  variant="ghost"
                  onClick={() => onSelectDate(day)}
                  aria-label={`Select and expand ${day.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  className="h-full w-full cursor-pointer flex-col items-center gap-1 px-0 py-1 transition-colors duration-200"
                >
                  <span
                    className={cn(
                      'flex h-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                      isSelected && 'text-xs',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {fullDate(day)}
                  </span>
                  <span className="h-4 max-w-full shrink-0 truncate px-2 text-xs leading-4 font-normal text-muted-foreground">
                    {day.toLocaleDateString('en-GB', {
                      weekday: isSelected ? 'long' : 'short',
                    })}
                    {isToday && isSelected && ' · Today'}
                  </span>
                </Button>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {dayEvents.length ? (
                  dayEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      expanded={isSelected && expandedSessionId === event.id}
                      focusStudentId={focusStudentId}
                      onToggle={() => onToggleSession(event)}
                    />
                  ))
                ) : (
                  <p className="px-1 py-3 text-xs text-muted-foreground">
                    No classes scheduled
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}
