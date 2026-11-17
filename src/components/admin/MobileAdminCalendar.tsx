import type { ReactNode } from 'react'
import { Calendar, CalendarDays, ChevronRight, List, TriangleAlert } from 'lucide-react'
import AttendanceCalendar from '@/components/admin/AttendanceCalendar'
import MobileCalendarHeader from '@/components/shared/calendar/MobileCalendarHeader'
import type { MobileViewOption } from '@/components/shared/calendar/MobileCalendarHeader'
import WeekStrip from '@/components/shared/calendar/WeekStrip'
import BackToTopButton from '@/components/shared/calendar/BackToTopButton'
import { CalendarSkeleton } from '@/components/shared/skeletons'
import { useSwipeDay } from '@/hooks/use-swipe-day'
import { addDays, addMonths, dateKey, formatTime, fullDate, monthDates, weekDates } from '@/lib/admin/attendance-calendar'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import { getSessionStyle } from '@/lib/admin/session-styles'
import { cn } from 'cn'

export type MobileAdminMode = 'day' | 'month' | 'list'

const views: MobileViewOption<MobileAdminMode>[] = [
  { value: 'day', label: 'day', icon: Calendar },
  { value: 'month', label: 'month', icon: CalendarDays },
  { value: 'list', label: 'list', icon: List },
]

const needsCover = (event: AdminCalendarEvent) => event.liveDetails?.unavailability?.status === 'open'
const studentCount = (event: AdminCalendarEvent) => event.rosterCount ?? event.roster.length

function eventsOn(events: AdminCalendarEvent[], day: Date) {
  const key = dateKey(day)
  return events.filter(event => dateKey(event.date) === key)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name))
}

// One class as a tappable row: time, a colour bar for its type, then the facts.
function Agenda({ events, day, selectedSessionId, onToggleSession }: {
  events: AdminCalendarEvent[]
  day: Date
  selectedSessionId: string | null
  onToggleSession: (event: AdminCalendarEvent) => void
}) {
  const items = eventsOn(events, day)
  if (!items.length) return <p className="py-4 text-sm text-muted-foreground">No classes.</p>
  return (
    <ul aria-label={`Classes on ${fullDate(day)}`} className="divide-y divide-border/60">
      {items.map(event => (
        <li key={event.id}>
          <button type="button" aria-pressed={selectedSessionId === event.id} onClick={() => onToggleSession(event)}
            aria-label={`${event.name}, ${fullDate(day)}, ${formatTime(event.startTime)} to ${formatTime(event.endTime)}. View details`}
            className="flex min-h-18 w-full items-stretch gap-3 rounded-md py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="w-18 shrink-0 whitespace-nowrap text-[13px] leading-5 tabular-nums max-md:w-20 max-md:text-[1rem] max-md:leading-6 text-muted-foreground">
              <span className="block">{formatTime(event.startTime)}</span>
              <span className="block opacity-70">{formatTime(event.endTime)}</span>
            </span>
            <span aria-hidden="true" className={cn('w-1 shrink-0 rounded-full ring-1 ring-foreground/15', getSessionStyle(event.session).dot)} />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex items-center gap-1.5 text-[16px] leading-snug font-medium [overflow-wrap:anywhere]">
                {needsCover(event) && <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-red-600 dark:text-red-400" />}
                {event.name}
              </span>
              <span className="block text-[13px] leading-5 text-muted-foreground max-md:text-[1rem] max-md:leading-6 [overflow-wrap:anywhere]">
                {[event.centreName, event.instructorName !== 'Unassigned' ? event.instructorName : null,
                  studentCount(event) > 0 ? `${studentCount(event)} ${studentCount(event) === 1 ? 'student' : 'students'}` : null]
                  .filter(Boolean).join(' · ')}
              </span>
              {needsCover(event) && <span className="inline-block rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-100">Cover needed</span>}
            </span>
            <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground/60" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// The month as dates with a dot per class type, so the busy days are visible at a glance.
function MonthDots({ date, today, events, onSelectDate }: {
  date: Date
  today: Date
  events: AdminCalendarEvent[]
  onSelectDate: (date: Date) => void
}) {
  return (
    // A full-width divider under the month (as on the instructor calendar), then the day's classes.
    <div role="grid" aria-label="Month" className="-mx-4 mb-3 grid grid-cols-7 gap-y-1 border-b border-border/60 px-4 pt-2 pb-4">
      {weekDates(date).map(day => (
        <span key={day.getDay()} role="columnheader" className="py-1 text-center text-[11px] font-medium max-md:text-cal text-muted-foreground">
          {day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}
        </span>
      ))}
      {monthDates(date).map(day => {
        const items = eventsOn(events, day)
        const types = [...new Set(items.map(event => event.session.type))].slice(0, 3)
        const selected = dateKey(day) === dateKey(date)
        const isToday = dateKey(day) === dateKey(today)
        const inMonth = day.getMonth() === date.getMonth()
        return (
          <button key={dateKey(day)} type="button" role="gridcell" aria-pressed={selected}
            aria-current={isToday ? 'date' : undefined}
            aria-label={`${fullDate(day)}, ${items.length === 1 ? '1 class' : `${items.length} classes`}`}
            onClick={() => onSelectDate(day)}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className={cn('flex size-8 items-center justify-center rounded-full text-[16px] tabular-nums',
              !inMonth && 'text-muted-foreground/50',
              selected ? 'bg-primary text-primary-foreground' : isToday && 'font-semibold text-brand-red-ink')}>
              {day.getDate()}
            </span>
            <span aria-hidden="true" className="flex h-1.5 gap-0.5">
              {types.map(type => {
                const sample = items.find(event => event.session.type === type)!
                return <span key={type} className={cn('size-1.5 rounded-full ring-1 ring-foreground/20', getSessionStyle(sample.session).dot)} />
              })}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// The admin calendar on a phone: the same shape as the instructor's. A header
// with a view picker, a swipeable week strip, and one day, the month or a week
// list below it. Desktop keeps the full toolbar and grids.
export default function MobileAdminCalendar({
  loading = false, mode, date, today, now, events, selectedSessionId, focusRequest, filter, legend,
  onChangeMode, onSelectDate, onToday, onToggleSession,
}: {
  loading?: boolean
  mode: MobileAdminMode
  date: Date
  today: Date
  now: Date
  events: AdminCalendarEvent[]
  selectedSessionId: string | null
  focusRequest: number
  filter: ReactNode
  legend: ReactNode
  onChangeMode: (mode: MobileAdminMode) => void
  onSelectDate: (date: Date) => void
  onToday: () => void
  onToggleSession: (event: AdminCalendarEvent) => void
}) {
  const swipe = useSwipeDay(direction => onSelectDate(addDays(date, direction)))
  const step = (direction: 1 | -1) => onSelectDate(mode === 'month' ? addMonths(date, direction) : addDays(date, direction))
  return (
    // A card: the header (pulled to the card's edges) is its tinted top strip. overflow-clip,
    // not overflow-hidden, rounds the corners without breaking the sticky day headings.
    <section aria-label="Class calendar" data-mobile-calendar className="min-w-0 overflow-clip rounded-xl border bg-card p-4 shadow-xs">
      <MobileCalendarHeader date={date} view={mode} views={views} onViewChange={onChangeMode}
        stepUnit={mode === 'month' ? 'month' : 'day'} onToday={onToday} todayLabel="Go to today"
        onPrevious={() => step(-1)} onNext={() => step(1)} extras={filter} legend={legend} />
      {mode === 'month'
        ? <MonthDots date={date} today={today} events={events} onSelectDate={onSelectDate} />
        : <WeekStrip date={date} today={today} onSelectDate={onSelectDate} />}
      {mode === 'month' && (
        // Screen readers still hear the chosen date; the grid already shows it on screen.
        <h2 aria-live="polite" className="sr-only">
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
      )}
      <div {...swipe}>
        {loading ? <CalendarSkeleton label="Loading classes…" /> : mode === 'day' ? (
          <AttendanceCalendar date={date} today={today} now={now} focusRequest={focusRequest} view="day" display="timeline"
            events={events} selectedSessionId={selectedSessionId} expandSelectedDay onSelectDate={onSelectDate}
            onToggleSession={onToggleSession} />
        ) : mode === 'month' ? (
          <Agenda events={events} day={date} selectedSessionId={selectedSessionId} onToggleSession={onToggleSession} />
        ) : (
          <div aria-label="Classes this week" className="space-y-4 pt-2">
            {/* Starts at the selected day (today on load), not Monday; only this week's classes are loaded. */}
            {weekDates(date).filter(day => day.getTime() >= new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()).map(day => {
              const count = eventsOn(events, day).length
              return (
                <section key={dateKey(day)}>
                  <h3 className={cn('sticky top-[var(--mobile-site-nav-height)] z-10 flex items-baseline justify-between border-b border-border/50 bg-card py-2 text-[14px] font-semibold max-md:text-[1rem]',
                    dateKey(day) === dateKey(today) && 'text-brand-red-ink')}>
                    <span>{day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}</span>
                    <span className="text-xs font-normal text-muted-foreground">{count === 1 ? '1 class' : `${count} classes`}</span>
                  </h3>
                  <Agenda events={events} day={day} selectedSessionId={selectedSessionId} onToggleSession={onToggleSession} />
                </section>
              )
            })}
          </div>
        )}
      </div>
      <BackToTopButton enabled={mode === 'day'} />
    </section>
  )
}

