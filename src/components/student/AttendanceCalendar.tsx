import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  classTypes,
  dateKey,
  formatTime,
  monthDates
} from '@/lib/instructor-calendar'
import {
  layoutTimelineItems,
  minutesTime,
  timeMinutes,
  TIMELINE_END,
  TIMELINE_START
} from '@/lib/instructor-availability'
import { dateTime, prettyDate } from '@/lib/student-schedule'
import type { ClassOffering, Enrollment } from '@/lib/student-schedule'
import type { BadgeTone } from '@/components/shared/status/StatusBadge'
import { cn } from '@/lib/utils'

/** A booking or a waitlist place, with its class. */
export type AttendanceEntry = Omit<Enrollment, 'status'> & {
  status: Enrollment['status'] | 'waitlisted'
  session: ClassOffering
}

const viewLabels = { day: 'Day', week: 'Week', month: 'Month' } as const
export type AttendanceView = keyof typeof viewLabels
export type AttendanceDisplay = 'timeline' | 'list'
const classStyles = new Map<string, { card: string; dot: string }>(
  Object.values(classTypes).map(style => [style.label, { card: style.card, dot: style.dot }])
)

export function attendanceClassStyle(title: string) {
  return classStyles.get(title)?.card ?? 'border-primary bg-primary/10 text-primary'
}

/** The small colour mark for a class type, as on the admin calendar's agenda. */
export function attendanceClassDot(title: string) {
  return classStyles.get(title)?.dot ?? 'bg-primary'
}

export function statusText(entry: AttendanceEntry) {
  if (entry.status === 'waitlisted') return 'Waitlisted'
  if (entry.status === 'attended') return 'Attended'
  if (entry.status === 'missed') return 'Absent'
  if (entry.status === 'late') return 'Late'
  if (entry.status === 'excused') return 'Excused'
  if (entry.status === 'cancelled') return 'Cancelled'
  if (dateTime(entry.session).getTime() <= Date.now()) return 'Past · not marked'
  return entry.status === 'make-up' ? 'Make-up class' : 'Enrolled'
}

export const statusTones: Record<string, BadgeTone> = {
  Waitlisted: 'warning',
  Attended: 'success',
  Late: 'warning',
  Absent: 'danger',
  Enrolled: 'info',
  'Make-up class': 'info',
}

const pillDots: Record<BadgeTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-primary',
  neutral: 'bg-muted-foreground',
}

/**
 * The booking status as a pill. A solid background keeps it readable on any
 * class colour; the dot carries the status colour.
 */
export function StatusPill({ entry, className }: { entry: AttendanceEntry; className?: string }) {
  const text = statusText(entry)
  return (
    <span className={cn('inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-foreground/10', className)}>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', pillDots[statusTones[text] ?? 'neutral'])} />
      <span className="truncate">{text}</span>
    </span>
  )
}

const typeOf = (entry: AttendanceEntry) => entry.session.classType ?? entry.session.title
const byTime = (a: AttendanceEntry, b: AttendanceEntry) => a.session.startTime.localeCompare(b.session.startTime)

function DateButton({
  day, date, today, onSelectDate, children, className, label
}: {
  day: Date
  date: Date
  today: Date
  onSelectDate: (date: Date) => void
  children?: ReactNode
  className?: string
  label?: string
}) {
  const selected = dateKey(day) === dateKey(date)
  const current = dateKey(day) === dateKey(today)

  return (
    <button
      type="button"
      aria-label={label ?? prettyDate(day)}
      aria-current={current ? 'date' : undefined}
      aria-pressed={selected}
      onClick={() => onSelectDate(day)}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1 bg-card p-1 text-xs outline-none hover:bg-muted focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-accent text-accent-foreground',
        className
      )}
    >
      <span className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full tabular-nums max-md:size-8 lg:size-7',
        current && 'bg-primary font-semibold text-primary-foreground'
      )}>
        {day.getDate()}
      </span>
      {children}
    </button>
  )
}

export default function AttendanceCalendar({
  date, today, view, display, days, entriesByDate, selectedId, onSelectDate, onSelectEntry, fill = false, pageScroll = false
}: {
  date: Date
  today: Date
  view: AttendanceView
  display: AttendanceDisplay
  /** The days the week view shows (3, 4 or 7, by screen width). */
  days: Date[]
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  selectedId: string | null
  onSelectDate: (date: Date) => void
  onSelectEntry: (entry: AttendanceEntry) => void
  /** Fill the parent's height (it must have one) instead of using a fixed height. */
  fill?: boolean
  /** Timeline only (phones): as tall as the day, and the page scrolls to the current time. */
  pageScroll?: boolean
}) {
  if (view === 'month') {
    const days = monthDates(date)
    return (
      <section aria-label="Monthly attendance calendar" className={cn('min-w-0 overflow-hidden rounded-xl border bg-border', fill && 'flex h-full flex-col')}>
        <div className="grid shrink-0 grid-cols-7 border-b bg-card">
          {days.slice(0, 7).map(day => (
            <span key={dateKey(day)} className="py-2 text-center text-xs font-medium text-muted-foreground max-md:text-cal">
              {day.toLocaleDateString('en-SG', { weekday: 'short' })}
            </span>
          ))}
        </div>
        <div className={cn('grid grid-cols-7 gap-px', fill && 'min-h-0 flex-1 auto-rows-fr')}>
          {days.map(day => {
            const entries = entriesByDate.get(dateKey(day)) ?? []
            return (
              <div key={dateKey(day)} className={cn('min-w-0 bg-card', fill ? 'min-h-0 overflow-hidden' : 'lg:min-h-24', dateKey(day) === dateKey(date) && 'bg-accent')}>
              <DateButton
                day={day} date={date} today={today} onSelectDate={onSelectDate}
                label={`${prettyDate(day)}, ${entries.length} ${entries.length === 1 ? 'class' : 'classes'}`}
                className={cn('min-h-12 w-full bg-transparent lg:min-h-8 lg:items-start lg:px-2', day.getMonth() !== date.getMonth() && 'text-muted-foreground')}
              >
                {entries.length > 0 && <span aria-hidden="true" className="size-1.5 rounded-full bg-primary lg:hidden" />}
              </DateButton>
              <div className="hidden space-y-0.5 px-1 pb-1 lg:block">
                {entries.slice(0, 2).map(entry => (
                  <button key={entry.id} type="button" aria-pressed={entry.id === selectedId}
                    aria-label={`${entry.session.title}, ${prettyDate(day)}, ${formatTime(entry.session.startTime)}. View details`}
                    onClick={() => onSelectEntry(entry)}
                    className={cn('block w-full truncate rounded-sm border px-1 py-0.5 text-left text-xs font-medium hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring',
                      attendanceClassStyle(entry.session.classType ?? entry.session.title), entry.id === selectedId && 'ring-1 ring-inset ring-current')}>
                    {formatTime(entry.session.startTime)} {entry.session.title}
                  </button>
                ))}
                {entries.length > 2 && <span className="px-1 text-xs text-muted-foreground">+{entries.length - 2} more</span>}
              </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  const shown = view === 'day' ? [date] : days
  if (display === 'list') {
    return <AttendanceDays date={date} today={today} view={view} days={shown} fill={fill}
      entriesByDate={entriesByDate} selectedId={selectedId} onSelectDate={onSelectDate} onSelectEntry={onSelectEntry} />
  }

  return <AttendanceTimeline
    key={view}
    date={date}
    today={today}
    view={view}
    days={shown}
    fill={fill}
    pageScroll={pageScroll}
    entriesByDate={entriesByDate}
    selectedId={selectedId}
    onSelectDate={onSelectDate}
    onSelectEntry={onSelectEntry}
  />
}

// One column per day with the day's classes as cards, like the admin calendar's list.
function AttendanceDays({
  date, today, view, days, entriesByDate, selectedId, onSelectDate, onSelectEntry, fill
}: {
  date: Date
  today: Date
  view: 'day' | 'week'
  days: Date[]
  fill: boolean
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  selectedId: string | null
  onSelectDate: (date: Date) => void
  onSelectEntry: (entry: AttendanceEntry) => void
}) {
  return (
    <div aria-label={view === 'day' ? 'Daily class list' : 'Weekly class list'}
      className={cn('flex min-h-0 overflow-hidden rounded-xl', fill && 'h-full', view === 'week' && 'divide-x border')}>
      {days.map(day => {
        const items = [...(entriesByDate.get(dateKey(day)) ?? [])].sort(byTime)
        const selected = dateKey(day) === dateKey(date)
        const isToday = dateKey(day) === dateKey(today)
        return (
          <section key={dateKey(day)} aria-label={day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            className={cn('flex min-w-0 flex-col bg-card', fill ? 'min-h-0' : 'min-h-64',
              selected && view === 'week' && days.length > 2 ? 'shrink-0 grow-0 basis-[clamp(220px,20vw,300px)] bg-accent/60' : 'flex-1 basis-0')}>
            {view === 'week' && (
              <header className="h-20 shrink-0 border-b p-2">
                <button type="button" onClick={() => onSelectDate(day)} aria-pressed={selected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  className="flex size-full flex-col items-center justify-center gap-1 rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums', isToday && 'bg-primary text-primary-foreground')}>
                    {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-xs text-muted-foreground">{day.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                </button>
              </header>
            )}
            <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto p-3', view === 'day' && 'grid auto-rows-max gap-3 space-y-0 bg-muted/30 xl:grid-cols-2')}>
              {items.map(entry => (
                <button key={entry.id} type="button" aria-pressed={selectedId === entry.id} onClick={() => onSelectEntry(entry)}
                  aria-label={`${entry.session.title}, ${prettyDate(day)}, ${formatTime(entry.session.startTime)} to ${formatTime(entry.session.endTime)}, ${statusText(entry)}. View details`}
                  className={cn(
                    'block w-full space-y-1 rounded-lg border p-3 text-left text-xs outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring',
                    attendanceClassStyle(typeOf(entry)),
                    selectedId === entry.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}>
                  <span className={cn('block leading-snug font-semibold wrap-break-word', view === 'day' ? 'text-sm sm:text-base' : 'text-xs')}>{entry.session.title}</span>
                  <span className={cn('block opacity-85', view === 'week' && 'text-2xs')}>{formatTime(entry.session.startTime)} – {formatTime(entry.session.endTime)}</span>
                  <span className={cn('block opacity-85 wrap-break-word', view === 'week' && 'text-2xs')}>{entry.session.centre}</span>
                  <StatusPill entry={entry} className="mt-1" />
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function AttendanceTimeline({
  date, today, view, days, entriesByDate, selectedId, onSelectDate, onSelectEntry, fill = false, pageScroll = false
}: {
  date: Date
  today: Date
  view: 'day' | 'week'
  days: Date[]
  fill?: boolean
  pageScroll?: boolean
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  selectedId: string | null
  onSelectDate: (date: Date) => void
  onSelectEntry: (entry: AttendanceEntry) => void
}) {
  const isDay = view === 'day'
  const columns = days.map(day => ({
    day,
    items: (entriesByDate.get(dateKey(day)) ?? []).map(entry => ({ ...entry.session, entry }))
  }))
  const items = columns.flatMap(column => column.items)
  // As on the admin calendar: a day shows all 24 hours at a taller scale, a week the class hours.
  const start = isDay ? 0 : Math.min(TIMELINE_START, ...items.map(item => Math.floor(timeMinutes(item.startTime) / 60) * 60))
  const end = isDay ? 24 * 60 : Math.max(TIMELINE_END, ...items.map(item => Math.ceil(timeMinutes(item.endTime) / 60) * 60))
  const halfHours = Array.from({ length: (end - start) / 30 }, (_, index) => start + index * 30)
  const hourLabels = Array.from({ length: (end - start) / 60 + 1 }, (_, index) => start + index * 60)
  const scale = isDay ? 1.6 : 1.2
  const height = (end - start) * scale
  const currentMinute = today.getHours() * 60 + today.getMinutes()
  const viewingToday = days.some(day => dateKey(day) === dateKey(today))
  const firstMinute = items.length ? Math.min(...items.map(item => timeMinutes(item.startTime))) : TIMELINE_START
  // A day opens at the current time (or the start of class hours); a week at its first class.
  const focusMinute = isDay ? (viewingToday ? currentMinute : TIMELINE_START) : firstMinute - 30
  const scrollRef = useRef<HTMLDivElement>(null)
  const rangeKey = `${view}:${dateKey(days[0])}`
  useLayoutEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return
    const position = (Math.max(start, Math.min(end, focusMinute)) - start) * scale
    if (pageScroll) {
      // The timeline is part of the page here: bring the focus time a third of the way down the screen.
      const top = viewport.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, top + position - window.innerHeight / 3), behavior: 'instant' })
      return
    }
    viewport.scrollTop = Math.max(0, isDay ? position - viewport.clientHeight / 3 : position)
    // Only when the range changes, not on every clock tick.
  }, [rangeKey])

  return (
    <section aria-label={view === 'week' ? 'Weekly hourly timeline' : 'Daily hourly timeline'} className={cn('min-w-0', fill && 'h-full min-h-0')}>
      <div ref={scrollRef} className={cn('relative rounded-xl border bg-card',
        pageScroll ? '' : 'overflow-auto overscroll-contain',
        pageScroll ? '' : fill ? 'h-full' : 'h-[min(65dvh,46rem)] lg:h-[clamp(24rem,calc(100dvh-15rem),56rem)]')}>
        <div className="grid" style={{ gridTemplateColumns: `${isDay ? 56 : 64}px repeat(${days.length}, minmax(0, 1fr))` }}>
          {/* A single day needs no date row: the week strip or toolbar already shows it. */}
          {!isDay && <div className="sticky top-0 left-0 z-30 border-r border-b bg-card" aria-hidden="true" />}
          {!isDay && days.map(day => (
            <div key={dateKey(day)} className="sticky top-0 z-30 min-w-0 border-r border-b bg-card">
              <DateButton day={day} date={date} today={today} onSelectDate={onSelectDate} className="min-h-12 w-full flex-col-reverse justify-center lg:min-h-16">
                <span className="truncate">{day.toLocaleDateString('en-SG', { weekday: 'short' })}</span>
              </DateButton>
            </div>
          ))}
          <div aria-hidden="true" className="sticky left-0 z-10 border-r bg-card" style={{ height: height + 20 }}>
            {hourLabels.map(minute => (
              <span key={minute} className="absolute right-2 text-3xs whitespace-nowrap text-muted-foreground tabular-nums"
                style={{ top: (minute - start) * scale + (minute === start ? 4 : 0), transform: minute === start ? undefined : 'translateY(-50%)' }}>
                {formatTime(minutesTime(minute % (24 * 60))).replace(':00', '')}
              </span>
            ))}
          </div>
          {columns.map(({ day, items: dayItems }) => (
            <div key={dateKey(day)} className="relative min-w-0 border-r" style={{ height: height + 20 }}>
              <div className="relative" style={{ height }}>
                {halfHours.map(minute => (
                  <div key={minute} aria-hidden="true"
                    className={cn('absolute inset-x-0 border-t border-border/60', minute % 60 !== 0 && (isDay ? 'border-border/25' : 'border-dashed border-border/40'))}
                    style={{ top: (minute - start) * scale, height: 30 * scale }} />
                ))}
                {dateKey(day) === dateKey(today) && currentMinute >= start && currentMinute < end && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-20 border-t border-brand-red-ink" style={{ top: (currentMinute - start) * scale }} />
                )}
                {layoutTimelineItems(dayItems).map(({ item, lane, lanes }) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`${item.title}, ${prettyDate(day)}, ${formatTime(item.startTime)} to ${formatTime(item.endTime)}, ${statusText(item.entry)}. View details`}
                    aria-pressed={selectedId === item.id}
                    onClick={() => onSelectEntry(item.entry)}
                    className={cn(
                      'absolute z-10 flex min-w-0 flex-col items-start overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-left text-xs shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring',
                      attendanceClassStyle(item.classType ?? item.title),
                      isDay && 'rounded-lg px-2.5 py-[3px]',
                      selectedId === item.id && 'z-[15] ring-2 ring-primary ring-offset-2 ring-offset-card'
                    )}
                    style={{
                      top: (timeMinutes(item.startTime) - start) * scale,
                      height: (timeMinutes(item.endTime) - timeMinutes(item.startTime)) * scale,
                      left: `calc(${lane / lanes * 100}% + ${isDay ? 6 : 3}px)`,
                      width: `calc(${100 / lanes}% - ${isDay ? 12 : 6}px)`
                    }}
                  >
                    <span className="w-full truncate font-semibold">{item.title}</span>
                    <span className="w-full truncate text-2xs">{formatTime(item.startTime)} – {formatTime(item.endTime)}</span>
                    <span className="w-full truncate text-2xs opacity-85">{item.centre}</span>
                    <StatusPill entry={item.entry} className="mt-0.5 px-1.5 text-[10px]" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
