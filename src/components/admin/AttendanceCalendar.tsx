import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  UserRound,
  Users,
} from 'lucide-react'
import LiveClassDetails from '@/components/admin/LiveClassDetails'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { CalendarDisplayMode as CalendarDisplay, CalendarRange as CalendarView } from '@/components/calendar/CalendarToolbar'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import {
  dateKey,
  formatTime,
  fullDate,
  layoutTimelineItems,
  minutesTime,
  monthDates,
  timeMinutes,
  TIMELINE_END,
  TIMELINE_START,
  weekDates,
} from '@/lib/admin/attendance-calendar'
import { getSessionStyle } from '@/lib/admin/session-styles'
import { cn } from 'cn'

type EventLayout = 'day' | 'week' | 'panel'

const coverNeededCardStyle = 'border-red-400 bg-red-100 text-red-950 hover:border-red-400 hover:bg-red-100 hover:text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-100 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-100'

function needsCover(event: AdminCalendarEvent) {
  return event.liveDetails?.unavailability?.status === 'open'
}

function eventCardStyle(event: AdminCalendarEvent) {
  return needsCover(event) ? coverNeededCardStyle : getSessionStyle(event.session).card
}

function SelectedIndicator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground',
        className,
      )}
    >
      <Check className="size-3" />
    </span>
  )
}

export function EventCard({
  event,
  expanded,
  onToggle,
  layout = 'week',
  detailsInPanel = false,
}: {
  event: AdminCalendarEvent
  expanded: boolean
  onToggle: () => void
  layout?: EventLayout
  detailsInPanel?: boolean
}) {
  const showSummary = layout !== 'week'
  return (
    <Card
      size="sm"
      className={cn(
        'gap-0 rounded-lg border py-0 text-inherit shadow-none ring-0 transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring',
        eventCardStyle(event),
        layout === 'panel' && 'border-0 lg:h-full lg:min-h-0 lg:border',
        expanded &&
          (detailsInPanel
            ? 'relative z-10 border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
            : 'border-primary/40 ring-1 ring-primary/15'),
      )}
    >
      <Button
        variant="ghost"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-pressed={detailsInPanel ? expanded : undefined}
        aria-controls={
          !detailsInPanel && layout !== 'panel'
            ? `attendance-details-${event.id}`
            : undefined
        }
        aria-label={`${event.name}, ${fullDate(event.date)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}, ${event.centreName}, ${event.rosterCount ?? event.roster.length} students. ${needsCover(event) ? 'Cover needed. ' : ''}${expanded ? 'Collapse' : 'Expand'} session details`}
        className={cn(
          'h-auto w-full shrink-0 cursor-pointer flex-col items-stretch gap-3 rounded-lg p-3 text-left whitespace-normal text-inherit hover:bg-foreground/5 hover:text-inherit aria-expanded:text-inherit focus-visible:-outline-offset-2',
          needsCover(event) && 'hover:bg-transparent dark:hover:bg-transparent',
          showSummary && 'p-4',
          layout === 'day' && 'gap-4 p-5',
        )}
      >
        <span
          className={cn(
            'flex items-start justify-between gap-2 text-xs leading-snug font-semibold',
            layout === 'day' && 'text-sm sm:text-base',
            layout === 'panel' && 'text-lg leading-tight sm:text-xl',
          )}
        >
          <span className="min-w-0 wrap-break-word">{event.name}</span>
          {expanded && detailsInPanel ? (
            <SelectedIndicator className="mt-0.5" />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'mt-0.5 size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                expanded && 'rotate-180',
                layout === 'panel' && 'mt-1 size-4',
              )}
            />
          )}
        </span>

        <div
          className={cn(
            'flex gap-2',
            expanded || showSummary
              ? 'flex-row flex-wrap items-center justify-between'
              : 'flex-col items-start',
          )}
        >
          <span className="flex items-center gap-1.5 text-2xs font-normal opacity-80">
            <Clock3 aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 wrap-break-word">
              {formatTime(event.startTime)} – {formatTime(event.endTime)}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-2xs font-normal opacity-80">
            <MapPin aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 wrap-break-word">{event.centreName}</span>
          </span>
        </div>

        <span className="flex items-center gap-1.5 text-2xs font-normal opacity-80">
          <UserRound aria-hidden="true" className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{event.instructorName}</span>
        </span>

        {needsCover(event) &&
          <span className="w-fit rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
            Cover needed
          </span>}

        <span className="flex items-center gap-1.5 text-2xs font-normal opacity-80">
          <Users aria-hidden="true" className="size-3 shrink-0" />
          {event.rosterCount ?? event.roster.length}{' '}
          {(event.rosterCount ?? event.roster.length) === 1 ? 'student' : 'students'}
        </span>
      </Button>

      {!detailsInPanel &&
        (layout === 'panel' ? (
          <LiveClassDetails event={event} fillHeight />
        ) : (
          <div
            id={`attendance-details-${event.id}`}
            aria-hidden={!expanded}
            inert={!expanded}
            className={cn(
              'grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none',
              expanded
                ? 'grid-rows-[1fr] opacity-100'
                : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <LiveClassDetails event={event} />
            </div>
          </div>
        ))}
    </Card>
  )
}

function eventsForDate(events: AdminCalendarEvent[], day: Date) {
  const key = dateKey(day)
  return events
    .filter((event) => dateKey(event.date) === key)
    .sort(
      (left, right) =>
        left.startTime.localeCompare(right.startTime) ||
        left.name.localeCompare(right.name),
    )
}

function CalendarDays({
  date,
  today,
  view,
  events,
  selectedSessionId,
  expandSelectedDay,
  onSelectDate,
  onToggleSession,
}: {
  date: Date
  today: Date
  view: 'day' | 'week'
  events: AdminCalendarEvent[]
  selectedSessionId: string | null
  expandSelectedDay: boolean
  onSelectDate: (date: Date) => void
  onToggleSession: (event: AdminCalendarEvent) => void
}) {
  const selectedDateButton = useRef<HTMLButtonElement>(null)
  const selectedKey = dateKey(date)
  const days = view === 'day' ? [date] : weekDates(date)

  useEffect(() => {
    selectedDateButton.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    })
  }, [selectedKey, view])

  return (
    <div
      aria-label={
        view === 'day' ? 'Daily class calendar' : 'Weekly class calendar'
      }
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      {view === 'week' && (
        <div
          role="group"
          aria-label="Select agenda day"
          className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:hidden"
        >
          {days.map((day) => {
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
                <span className="text-2xs font-normal">
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
      )}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl lg:flex-row',
          view === 'week' && 'border lg:divide-x',
        )}
      >
        {days.map((day) => {
          const dayEvents = eventsForDate(events, day)
          const isToday = dateKey(day) === dateKey(today)
          const isSelected = dateKey(day) === selectedKey
          const isExpanded = isSelected && expandSelectedDay
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
                isExpanded && view === 'week'
                  ? 'bg-accent/60 lg:grow-0 lg:basis-[clamp(300px,24vw,320px)]'
                  : 'lg:grow lg:basis-0',
              )}
              data-selected={isExpanded}
            >
              {view === 'week' && (
                <header
                  className={cn(
                    'h-20 shrink-0 border-b p-2 transition-colors duration-200',
                    isExpanded && 'bg-accent/70',
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
                    aria-pressed={isExpanded}
                    className="h-full w-full cursor-pointer flex-col items-center gap-1 px-0 py-1 transition-colors duration-200"
                  >
                    <span
                      className={cn(
                        'flex h-6 shrink-0 items-center justify-center rounded-full px-1.5 text-3xs font-semibold tabular-nums',
                        isExpanded && 'text-xs',
                        isToday && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {fullDate(day)}
                    </span>
                    <span className="h-5 max-w-full shrink-0 truncate px-2 text-xs font-normal text-muted-foreground">
                      {day.toLocaleDateString('en-GB', {
                        weekday: isExpanded ? 'long' : 'short',
                      })}
                      {isToday && isExpanded && ' · Today'}
                    </span>
                  </Button>
                </header>
              )}

              <div
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto',
                  view === 'day'
                    ? 'grid auto-rows-max items-start gap-4 bg-muted/30 p-2 xl:grid-cols-2'
                    : 'space-y-3 p-3',
                )}
              >
                {dayEvents.length ? (
                  dayEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      layout={view}
                      detailsInPanel
                      expanded={isSelected && selectedSessionId === event.id}
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
    </div>
  )
}

function CalendarMonth({
  date,
  today,
  events,
  selectedSessionId,
  onSelectDate,
  onToggleSession,
}: {
  date: Date
  today: Date
  events: AdminCalendarEvent[]
  selectedSessionId: string | null
  onSelectDate: (date: Date) => void
  onToggleSession: (event: AdminCalendarEvent) => void
}) {
  const selectedDay = useRef<HTMLElement>(null)
  const selectedKey = dateKey(date)
  const days = monthDates(date)

  useEffect(() => {
    selectedDay.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [selectedKey])

  return (
    <div
      aria-label="Monthly class calendar"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div
        aria-label="Month dates"
        className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain rounded-xl border bg-card"
      >
        <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 border-b bg-card">
          {days.slice(0, 7).map((day) => (
            <div
              key={day.getDay()}
              className="py-2 text-center text-2xs font-medium text-muted-foreground sm:text-xs"
            >
              {day.toLocaleDateString('en-GB', { weekday: 'short' })}
            </div>
          ))}
        </div>
        <div
          className="grid min-h-0 flex-1 grid-cols-7 [--month-row-height:144px] xl:[--month-row-height:112px]"
          style={{
            gridTemplateRows: `repeat(${days.length / 7}, minmax(var(--month-row-height), 1fr))`,
          }}
        >
          {days.map((day) => {
            const key = dateKey(day)
            const isSelected = key === selectedKey
            const isToday = key === dateKey(today)
            const isCurrentMonth = day.getMonth() === date.getMonth()
            const dayEvents = eventsForDate(events, day)
            return (
              <section
                key={key}
                ref={isSelected ? selectedDay : undefined}
                aria-label={day.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                onClick={(event) => {
                  if (event.target === event.currentTarget) onSelectDate(day)
                }}
                className={cn(
                  'flex min-w-0 flex-col items-start gap-0.5 overflow-y-auto border-r border-b border-border/60 p-1 nth-[7n]:border-r-0 sm:p-1.5',
                  !isCurrentMonth && 'bg-muted/40 text-muted-foreground',
                  isSelected &&
                    'bg-primary/5 ring-1 ring-primary/40 ring-inset',
                )}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Select ${day.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  onClick={() => onSelectDate(day)}
                  className={cn(
                    'size-6 rounded-full text-2xs tabular-nums sm:size-7 sm:text-xs',
                    isSelected && 'bg-primary/10 font-semibold text-primary',
                    isToday &&
                      'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
                  )}
                >
                  {day.getDate()}
                </Button>
                {dayEvents.map((event) => {
                  const selected = selectedSessionId === event.id
                  return (
                    <Button
                      key={event.id}
                      variant="ghost"
                       title={`${event.name} · ${formatTime(event.startTime)} · ${event.rosterCount ?? event.roster.length} students${needsCover(event) ? ' · Cover needed' : ''}`}
                       aria-label={`${event.name}, ${fullDate(day)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}. ${needsCover(event) ? 'Cover needed. ' : ''}${selected ? 'Collapse' : 'Expand'} session attendance`}
                      aria-expanded={selected}
                      aria-pressed={selected}
                      onClick={() => onToggleSession(event)}
                      className={cn(
                         'h-auto min-h-5 w-full min-w-0 cursor-pointer flex-col items-start gap-0 rounded border-0 px-1 py-0.5 text-left text-3xs leading-tight xl:flex-row xl:items-center xl:gap-1',
                         eventCardStyle(event),
                        selected &&
                          'relative z-[1] pr-5 ring-2 ring-primary ring-offset-1 ring-offset-background',
                      )}
                    >
                      {selected && (
                        <SelectedIndicator className="absolute top-0.5 right-0.5 size-3.5" />
                      )}
                      <span className="w-full min-w-0 truncate font-medium xl:w-auto xl:flex-1">
                        {event.name}
                      </span>
                      <span className="max-w-full shrink-0 truncate font-normal opacity-80">
                        {formatTime(event.startTime)}
                      </span>
                    </Button>
                  )
                })}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CalendarTimeline({
  date,
  now,
  view,
  focusRequest,
  events,
  selectedSessionId,
  onSelectDate,
  onToggleSession,
}: {
  date: Date
  now: Date
  view: 'day' | 'week'
  focusRequest: number
  events: AdminCalendarEvent[]
  selectedSessionId: string | null
  onSelectDate: (date: Date) => void
  onToggleSession: (event: AdminCalendarEvent) => void
}) {
  const isDay = view === 'day'
  const timelineStart = isDay ? 0 : TIMELINE_START
  const timelineEnd = isDay ? 24 * 60 : TIMELINE_END
  const slotHeight = isDay ? 48 : 36
  const pixelsPerMinute = slotHeight / 30
  const height = (timelineEnd - timelineStart) * pixelsPerMinute
  const intervals = Array.from(
    { length: (timelineEnd - timelineStart) / 30 },
    (_, index) => timelineStart + index * 30,
  )
  const days = view === 'day' ? [date] : weekDates(date)
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const focusDayRef = useRef<HTMLDivElement>(null)
  const nowRef = useRef(now)
  nowRef.current = now
  const rangeKey = `${view}:${dateKey(days[0])}`
  const todayKey = dateKey(now)
  const focusDayKey = days.some((day) => dateKey(day) === todayKey)
    ? todayKey
    : dateKey(date)
  const nowMinutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60

  // Focus when navigating, but don't jump the scroll position on clock updates.
  useLayoutEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return

    const focusCurrentTime = () => {
      const headerHeight = headerRef.current?.offsetHeight ?? 0
      const visibleHeight = viewport.clientHeight - headerHeight
      if (visibleHeight <= 0) return false
      const current = nowRef.current
      const viewingToday = dateKey(date) === dateKey(current)
      const focusMinute =
        isDay && !viewingToday
          ? TIMELINE_START
          : current.getHours() * 60 + current.getMinutes() + current.getSeconds() / 60
      const minute = Math.max(timelineStart, Math.min(timelineEnd, focusMinute))
      const position = (minute - timelineStart) * pixelsPerMinute
      let left = viewport.scrollLeft
      const column = focusDayRef.current
      if (column) {
        const gutterWidth = headerRef.current?.offsetWidth ?? (isDay ? 56 : 64)
        const columnLeft =
          column.getBoundingClientRect().left -
          viewport.getBoundingClientRect().left +
          viewport.scrollLeft -
          viewport.clientLeft
        left =
          columnLeft -
          gutterWidth -
          Math.max(0, viewport.clientWidth - gutterWidth - column.offsetWidth) / 2
      }
      viewport.scrollTo({
        top: Math.max(0, position - visibleHeight / 3),
        left: Math.max(0, left),
        behavior: 'instant',
      })
      return true
    }

    if (focusCurrentTime()) return
    const observer = new ResizeObserver(() => {
      if (focusCurrentTime()) observer.disconnect()
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [rangeKey, focusRequest, timelineStart, timelineEnd, pixelsPerMinute, isDay])

  return (
    <section
      aria-label={`${view === 'day' ? 'Daily' : 'Weekly'} hourly timeline`}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border bg-card"
      >
        <div
          className="grid"
          style={{
            minWidth: view === 'week' ? 910 : undefined,
            gridTemplateColumns: `${isDay ? 56 : 64}px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {!isDay && (
            <div
              ref={headerRef}
              className="sticky top-0 left-0 z-40 border-r border-b bg-card p-2 text-3xs text-muted-foreground"
            />
          )}
          {!isDay && days.map((day) => {
            const isToday = dateKey(day) === dateKey(now)
            return (
              <div
                key={dateKey(day)}
                className={cn(
                  'sticky top-0 z-30 border-r border-b bg-card px-3 py-2.5 text-center',
                  isToday && 'bg-accent',
                )}
              >
                <Button
                  variant="ghost"
                  onClick={() => onSelectDate(day)}
                  aria-current={isToday ? 'date' : undefined}
                  className="h-auto flex-col gap-1.5 px-4 py-2 text-xs"
                >
                  <span className="font-normal text-muted-foreground">
                    {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </span>
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-sm',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {day.getDate()}
                  </span>
                </Button>
              </div>
            )
          })}

          <div
            className="sticky left-0 z-10 border-r bg-card"
            style={{ height: height + 20 }}
            aria-hidden="true"
          >
            {Array.from(
              { length: (timelineEnd - timelineStart) / 60 + 1 },
              (_, index) => timelineStart + index * 60,
            ).map((minute) => (
              <span
                key={minute}
                className="absolute right-2 text-3xs text-muted-foreground tabular-nums"
                style={{
                  top: (minute - timelineStart) * pixelsPerMinute,
                  transform:
                    minute === timelineStart
                      ? undefined
                      : 'translateY(-50%)',
                }}
              >
                {formatTime(minutesTime(minute % (24 * 60))).replace(':00', '')}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const key = dateKey(day)
            const isToday = key === dateKey(now)
            const items = eventsForDate(events, day).filter(
              (event) =>
                timeMinutes(event.endTime) > timelineStart &&
                timeMinutes(event.startTime) < timelineEnd,
            )
            return (
              <div
                key={key}
                ref={key === focusDayKey ? focusDayRef : undefined}
                className={cn(
                  'relative border-r',
                  isToday && !isDay && 'bg-primary/[0.025]',
                )}
                style={{ height: height + 20 }}
              >
                <div
                  className="relative select-none"
                  style={{ height }}
                >
                  {intervals.map((minute) => (
                    <div
                      key={minute}
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-x-0 w-full border-t border-border/60',
                        minute % 60 !== 0 && (isDay ? 'border-border/25' : 'border-dashed'),
                      )}
                      style={{
                        top: (minute - timelineStart) * pixelsPerMinute,
                        height: slotHeight,
                      }}
                    />
                  ))}
                  {layoutTimelineItems(items).map(({ item, lane, lanes }) => {
                    const start = Math.max(
                      timelineStart,
                      timeMinutes(item.startTime),
                    )
                    const end = Math.min(
                      timelineEnd,
                      timeMinutes(item.endTime),
                    )
                    const selected = selectedSessionId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                         aria-label={`${item.name}, ${fullDate(day)}, ${formatTime(item.startTime)} to ${formatTime(item.endTime)}. ${needsCover(item) ? 'Cover needed. ' : ''}${selected ? 'Collapse' : 'Expand'} session attendance`}
                        onClick={() => onToggleSession(item)}
                        className={cn(
                           'absolute z-10 flex cursor-pointer flex-col items-start overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-left text-xs shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
                           eventCardStyle(item),
                          selected &&
                            'z-[15] ring-2 ring-primary ring-offset-2 ring-offset-card',
                          isDay && 'rounded-lg px-2.5 py-[3px] text-2xs leading-tight',
                        )}
                        style={{
                          top: (start - timelineStart) * pixelsPerMinute,
                          height: (end - start) * pixelsPerMinute,
                          left: `calc(${(lane * 100) / lanes}% + ${isDay ? 6 : 3}px)`,
                          width: `calc(${100 / lanes}% - ${isDay ? 12 : 6}px)`,
                        }}
                      >
                        {selected && (
                          <SelectedIndicator className="absolute top-1 right-1" />
                        )}
                        <span
                          className={cn(
                            'block max-w-full truncate font-semibold',
                            selected && 'pr-5',
                          )}
                        >
                          {item.name}
                        </span>
                        <span className="block text-3xs leading-tight">
                          {formatTime(item.startTime)} –{' '}
                          {formatTime(item.endTime)}
                        </span>
                        {isDay && (
                          <span className="flex max-w-full items-center gap-1 text-3xs leading-tight opacity-80">
                            <MapPin aria-hidden="true" className="size-3 shrink-0" />
                            <span className="truncate">{item.centreName}</span>
                          </span>
                        )}
                        {end - start >= 60 && !isDay && (
                          <span className="mt-1 flex w-full flex-col gap-0.5 text-3xs leading-tight opacity-80">
                            <span className="min-w-0 truncate">
                              {item.instructorName}
                            </span>
                            <span className="min-w-0 truncate">
                              {item.rosterCount ?? item.roster.length}{' '}
                              {(item.rosterCount ?? item.roster.length) === 1
                                ? 'student'
                                : 'students'}
                            </span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                  {isToday &&
                    nowMinutes >= timelineStart &&
                    nowMinutes <= timelineEnd && (
                      <div
                        role="img"
                        aria-label={`Current time: ${formatTime(minutesTime(Math.floor(nowMinutes)))}`}
                        className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                        style={{
                          top:
                            (nowMinutes - timelineStart) * pixelsPerMinute,
                        }}
                      >
                        <span className="absolute -top-[5px] -left-1 size-2 rounded-full bg-red-500" />
                      </div>
                    )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default function AttendanceCalendar({
  date,
  today,
  now,
  focusRequest = 0,
  view,
  display,
  events,
  selectedSessionId,
  expandSelectedDay,
  onSelectDate,
  onToggleSession,
}: {
  date: Date
  today: Date
  now: Date
  focusRequest?: number
  view: CalendarView
  display: CalendarDisplay
  events: AdminCalendarEvent[]
  selectedSessionId: string | null
  expandSelectedDay: boolean
  onSelectDate: (date: Date) => void
  onToggleSession: (event: AdminCalendarEvent) => void
}) {
  if (view === 'month') {
    return (
      <CalendarMonth
        date={date}
        today={today}
        events={events}
        selectedSessionId={selectedSessionId}
        onSelectDate={onSelectDate}
        onToggleSession={onToggleSession}
      />
    )
  }

  if (display === 'timeline') {
    return (
      <CalendarTimeline
        date={date}
        now={now}
        focusRequest={focusRequest}
        view={view}
        events={events}
        selectedSessionId={selectedSessionId}
        onSelectDate={onSelectDate}
        onToggleSession={onToggleSession}
      />
    )
  }

  return (
    <CalendarDays
      date={date}
      today={today}
      view={view}
      events={events}
      selectedSessionId={selectedSessionId}
      expandSelectedDay={expandSelectedDay}
      onSelectDate={onSelectDate}
      onToggleSession={onToggleSession}
    />
  )
}
