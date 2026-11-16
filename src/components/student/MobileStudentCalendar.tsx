import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Calendar, CalendarDays, ChevronRight, List } from 'lucide-react'
import AttendanceCalendar, { attendanceClassDot, statusText, statusTones } from '@/components/student/AttendanceCalendar'
import type { AttendanceEntry } from '@/components/student/AttendanceCalendar'
import MobileCalendarHeader from '@/components/shared/calendar/MobileCalendarHeader'
import type { MobileViewOption } from '@/components/shared/calendar/MobileCalendarHeader'
import WeekStrip from '@/components/shared/calendar/WeekStrip'
import BackToTopButton from '@/components/shared/calendar/BackToTopButton'
import { StatusBadge } from '@/components/shared/status/StatusBadge'
import { useSwipeDay } from '@/hooks/use-swipe-day'
import { addDays, addMonths, dateKey, formatTime, monthDates, weekDates } from '@/lib/instructor-calendar'
import { dateTime } from '@/lib/student-schedule'
import { cn } from '@/lib/utils'

export type MobileStudentMode = 'day' | 'month' | 'list'

// The same three phone views as the admin and instructor calendars.
const views: MobileViewOption<MobileStudentMode>[] = [
  { value: 'day', label: 'day', icon: Calendar },
  { value: 'month', label: 'month', icon: CalendarDays },
  { value: 'list', label: 'list', icon: List },
]

const fullDate = (day: Date) => day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const typeOf = (entry: AttendanceEntry) => entry.session.classType ?? entry.session.title

function entriesOn(entriesByDate: ReadonlyMap<string, AttendanceEntry[]>, day: Date) {
  return [...(entriesByDate.get(dateKey(day)) ?? [])]
    .sort((a, b) => a.session.startTime.localeCompare(b.session.startTime) || a.session.title.localeCompare(b.session.title))
}

/**
 * Shown where the visible days have no classes: a jump to the next booked day
 * after them, or to Classes when nothing else is booked.
 */
function NextClass({ after, entriesByDate, onSelectDate }: {
  after: Date
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  onSelectDate: (date: Date) => void
}) {
  const afterKey = dateKey(after)
  const next = [...entriesByDate.values()].flat()
    .filter(entry => dateKey(entry.session.date) > afterKey)
    .sort((a, b) => dateTime(a.session).getTime() - dateTime(b.session).getTime())[0]
  const className = 'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-dashed bg-card/50 px-4 py-3 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
  if (!next) {
    return (
      <Link to="/classes" className={className}>
        <span>Nothing else booked yet. <span className="font-medium text-primary">Find a class</span></span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => onSelectDate(next.session.date)} className={className}>
      <span className="min-w-0">
        <span className="block text-muted-foreground">Your next class is on</span>
        <span className="block font-medium">
          {next.session.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}{next.session.title}, {formatTime(next.session.startTime)}
        </span>
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
    </button>
  )
}

// One booking as a tappable row: time, a colour bar for its type, then the facts.
function Agenda({ entries, day, selectedId, onSelectEntry }: {
  entries: AttendanceEntry[]
  day: Date
  selectedId: string | null
  onSelectEntry: (entry: AttendanceEntry) => void
}) {
  if (!entries.length) return null
  return (
    <ul aria-label={`Classes on ${fullDate(day)}`} className="divide-y divide-border/60">
      {entries.map(entry => (
        <li key={entry.id}>
          <button type="button" aria-pressed={selectedId === entry.id} onClick={() => onSelectEntry(entry)}
            aria-label={`${entry.session.title}, ${fullDate(day)}, ${formatTime(entry.session.startTime)} to ${formatTime(entry.session.endTime)}, ${statusText(entry)}. View details`}
            className="flex min-h-18 w-full items-stretch gap-3 rounded-md py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="w-18 shrink-0 text-[13px] leading-5 tabular-nums text-muted-foreground">
              <span className="block">{formatTime(entry.session.startTime)}</span>
              <span className="block opacity-70">{formatTime(entry.session.endTime)}</span>
            </span>
            <span aria-hidden="true" className={cn('w-1 shrink-0 rounded-full ring-1 ring-foreground/15', attendanceClassDot(typeOf(entry)))} />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block text-[16px] leading-snug font-medium [overflow-wrap:anywhere]">{entry.session.title}</span>
              <span className="block text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                {[entry.session.centre, entry.session.instructor].filter(Boolean).join(' · ')}
              </span>
              <StatusBadge tone={statusTones[statusText(entry)] ?? 'neutral'}>{statusText(entry)}</StatusBadge>
            </span>
            <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground/60" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// The month as dates with a dot per class type, so booked days are visible at a glance.
function MonthDots({ date, today, entriesByDate, onSelectDate }: {
  date: Date
  today: Date
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  onSelectDate: (date: Date) => void
}) {
  return (
    // A full-width divider under the month (as on the instructor calendar), then the day's classes.
    <div role="grid" aria-label="Month" className="-mx-4 mb-3 grid grid-cols-7 gap-y-1 border-b border-border/60 px-4 pt-2 pb-4">
      {weekDates(date).map(day => (
        <span key={day.getDay()} role="columnheader" className="py-1 text-center text-[11px] font-medium text-muted-foreground">
          {day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}
        </span>
      ))}
      {monthDates(date).map(day => {
        const items = entriesOn(entriesByDate, day)
        const types = [...new Set(items.map(typeOf))].slice(0, 3)
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
              {types.map(type => <span key={type} className={cn('size-1.5 rounded-full ring-1 ring-foreground/20', attendanceClassDot(type))} />)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The student schedule on a phone, shaped like the admin calendar: a header
 * with a view picker, a swipeable week strip, and below it the upcoming
 * classes, one day, a 1–2 day list or the month. Wider screens use the full
 * toolbar and grids.
 */
export default function MobileStudentCalendar({
  mode, date, today, entriesByDate, selectedId, filter, legend,
  onChangeMode, onSelectDate, onToday, onSelectEntry,
}: {
  mode: MobileStudentMode
  date: Date
  today: Date
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  selectedId: string | null
  filter: ReactNode
  legend: ReactNode
  onChangeMode: (mode: MobileStudentMode) => void
  onSelectDate: (date: Date) => void
  onToday: () => void
  onSelectEntry: (entry: AttendanceEntry) => void
}) {
  // List: the selected day (today on load) through the end of its week, as on the admin calendar.
  const listDays = weekDates(date).filter(day => day.getTime() >= new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime())
  const visibleEmpty = (mode === 'list' ? listDays : [date]).every(day => !entriesOn(entriesByDate, day).length)
  const lastVisible = mode === 'list' ? listDays[listDays.length - 1] : date
  const marks = (day: Date) => [...new Set(entriesOn(entriesByDate, day).map(entry => attendanceClassDot(typeOf(entry))))]
  const nextClass = <NextClass after={lastVisible} entriesByDate={entriesByDate} onSelectDate={onSelectDate} />
  const swipe = useSwipeDay(direction => onSelectDate(addDays(date, direction)))
  const step = (direction: 1 | -1) => onSelectDate(mode === 'month' ? addMonths(date, direction) : addDays(date, direction))
  return (
    // A card, like the admin and instructor calendars: the header (pulled to the card's edges)
    // is its tinted top strip; overflow-clip keeps the sticky day headings sticking.
    // Phones: reach 17px into the page's 24px inset so the 7-column grids keep their width.
    <section aria-label="Class calendar" data-mobile-calendar className="min-w-0 overflow-clip rounded-xl border bg-card p-4 max-sm:-mx-[17px]">
      <MobileCalendarHeader date={date} view={mode} views={views} onViewChange={onChangeMode}
        stepUnit={mode === 'month' ? 'month' : 'day'} onToday={onToday} todayLabel="Go to today"
        onPrevious={() => step(-1)} onNext={() => step(1)} extras={filter} legendTitle="Class colours" legend={legend} />
      {mode === 'month'
        ? <MonthDots date={date} today={today} entriesByDate={entriesByDate} onSelectDate={onSelectDate} />
        : <WeekStrip date={date} today={today} onSelectDate={onSelectDate} marks={marks} />}
      {mode === 'month' && (
        // Screen readers still hear the chosen date; the grid already shows it on screen.
        <h2 aria-live="polite" className="sr-only">
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
      )}
      <div {...swipe}>
        {mode === 'list' ? (
          <div aria-label="Classes this week" className="space-y-4 pt-2">
            {listDays.map(day => {
              const entries = entriesOn(entriesByDate, day)
              return (
                <section key={dateKey(day)}>
                  <h3 className={cn('sticky top-[var(--mobile-site-nav-height)] z-10 flex items-baseline justify-between border-b border-border/50 bg-card py-2 text-[14px] font-semibold',
                    dateKey(day) === dateKey(today) && 'text-brand-red-ink')}>
                    <span>{day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}</span>
                    <span className="text-xs font-normal text-muted-foreground">{entries.length === 1 ? '1 class' : `${entries.length} classes`}</span>
                  </h3>
                  {entries.length
                    ? <Agenda entries={entries} day={day} selectedId={selectedId} onSelectEntry={onSelectEntry} />
                    : <p className="py-3 text-[14px] text-muted-foreground">No classes.</p>}
                </section>
              )
            })}
            {visibleEmpty && nextClass}
          </div>
        ) : visibleEmpty && mode === 'day' ? (
          <div className="pt-2">{nextClass}</div>
        ) : mode === 'day' ? (
          // Full height in the page, opening at the current time (as on the admin calendar).
          <AttendanceCalendar date={date} today={today} view="day" display="timeline" days={[date]} pageScroll
            entriesByDate={entriesByDate} selectedId={selectedId} onSelectDate={onSelectDate} onSelectEntry={onSelectEntry} />
        ) : (
          visibleEmpty ? nextClass : <Agenda entries={entriesOn(entriesByDate, date)} day={date} selectedId={selectedId} onSelectEntry={onSelectEntry} />
        )}
      </div>
      <BackToTopButton enabled={mode === 'day'} />
    </section>
  )
}
