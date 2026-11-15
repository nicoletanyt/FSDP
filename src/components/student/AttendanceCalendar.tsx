import { useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  classTypes,
  dateKey,
  formatTime,
  monthDates,
  weekDates
} from '@/lib/instructor-calendar'
import {
  layoutTimelineItems,
  minutesTime,
  timeMinutes,
  TIMELINE_END,
  TIMELINE_START
} from '@/lib/instructor-availability'
import { prettyDate } from '@/lib/student-schedule'
import type { ClassOffering, Enrollment } from '@/lib/student-schedule'
import { cn } from '@/lib/utils'

export type AttendanceEntry = Enrollment & { session: ClassOffering }

const viewLabels = { day: 'Day', week: 'Week', month: 'Month' } as const
export type AttendanceView = keyof typeof viewLabels
const classStyles = new Map<string, string>(
  Object.values(classTypes).map(style => [style.label, style.card])
)

export function attendanceClassStyle(title: string) {
  return classStyles.get(title) ?? 'border-primary bg-primary/10 text-primary'
}

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
        'grid size-6 shrink-0 place-items-center rounded-full tabular-nums lg:size-7',
        current && 'bg-primary font-semibold text-primary-foreground'
      )}>
        {day.getDate()}
      </span>
      {children}
    </button>
  )
}

export default function AttendanceCalendar({
  date, today, view, entriesByDate, selectedId, onSelectDate, onSelectEntry
}: {
  date: Date
  today: Date
  view: AttendanceView
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  selectedId: string | null
  onSelectDate: (date: Date) => void
  onSelectEntry: (entry: AttendanceEntry) => void
}) {
  if (view === 'month') {
    const days = monthDates(date)
    return (
      <section aria-label="Monthly attendance calendar" className="min-w-0 overflow-hidden rounded-xl border bg-border">
        <div className="grid grid-cols-7 border-b bg-card">
          {days.slice(0, 7).map(day => (
            <span key={dateKey(day)} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {day.toLocaleDateString('en-SG', { weekday: 'short' })}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {days.map(day => {
            const entries = entriesByDate.get(dateKey(day)) ?? []
            return (
              <div key={dateKey(day)} className={cn('min-w-0 bg-card lg:min-h-24', dateKey(day) === dateKey(date) && 'bg-accent')}>
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

  return <AttendanceTimeline
    key={view}
    date={date}
    today={today}
    view={view}
    entriesByDate={entriesByDate}
    selectedId={selectedId}
    onSelectDate={onSelectDate}
    onSelectEntry={onSelectEntry}
  />
}

function AttendanceTimeline({
  date, today, view, entriesByDate, selectedId, onSelectDate, onSelectEntry
}: {
  date: Date
  today: Date
  view: 'day' | 'week'
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  selectedId: string | null
  onSelectDate: (date: Date) => void
  onSelectEntry: (entry: AttendanceEntry) => void
}) {
  const days = view === 'day' ? [date] : weekDates(date)
  const columns = days.map(day => ({
    day,
    items: (entriesByDate.get(dateKey(day)) ?? []).map(entry => ({ ...entry.session, entry }))
  }))
  const items = columns.flatMap(column => column.items)
  const start = Math.min(TIMELINE_START, ...items.map(item => Math.floor(timeMinutes(item.startTime) / 60) * 60))
  const end = Math.max(TIMELINE_END, ...items.map(item => Math.ceil(timeMinutes(item.endTime) / 60) * 60))
  const hours = Array.from({ length: (end - start) / 60 }, (_, index) => start + index * 60)
  const scale = 1.2
  const currentMinute = today.getHours() * 60 + today.getMinutes()
  const firstMinute = items.length ? Math.min(...items.map(item => timeMinutes(item.startTime))) : start
  const scrollStart = Math.max(0, (firstMinute - start - 30) * scale)
  const positionTimeline = useCallback((element: HTMLDivElement | null) => {
    if (element) element.scrollTop = scrollStart
  }, [scrollStart])

  return (
    <section aria-label={view === 'week' ? 'Weekly hourly timeline' : 'Daily hourly timeline'} className="min-w-0 space-y-3">
      <div ref={positionTimeline} className="relative h-[min(65dvh,46rem)] overflow-auto rounded-xl border bg-card lg:h-[clamp(24rem,calc(100dvh-15rem),56rem)]">
        {!items.length && <p className="pointer-events-none absolute inset-x-0 top-20 z-20 mx-auto w-fit rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">No classes for this selection.</p>}
        <div className="grid" style={{ gridTemplateColumns: `2.75rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="sticky top-0 z-30 border-b bg-card" aria-hidden="true" />
          {days.map(day => (
            <div key={dateKey(day)} className="sticky top-0 z-30 min-w-0 border-b border-l bg-card">
              <DateButton day={day} date={date} today={today} onSelectDate={onSelectDate} className="min-h-12 w-full flex-col-reverse justify-center lg:min-h-16">
                <span className="truncate">{day.toLocaleDateString('en-SG', { weekday: 'short' })}</span>
              </DateButton>
            </div>
          ))}
          <div aria-hidden="true" className="relative text-right text-xs tabular-nums text-muted-foreground">
            {hours.map(hour => (
              <span key={hour} className="absolute right-1 pt-1 text-[10px] whitespace-nowrap" style={{ top: (hour - start) * scale }}>
                {formatTime(minutesTime(hour)).replace(':00', '')}
              </span>
            ))}
          </div>
          {columns.map(({ day, items: dayItems }) => (
            <div key={dateKey(day)} className="relative min-w-0 border-l" style={{ height: (end - start) * scale }}>
              {hours.map(hour => (
                <div key={hour} aria-hidden="true" className="absolute inset-x-0 border-t border-border/60" style={{ top: (hour - start) * scale, height: 30 * scale }}>
                  <div className="absolute inset-x-0 bottom-0 border-t border-dashed border-border/40" />
                </div>
              ))}
              {dateKey(day) === dateKey(today) && currentMinute >= start && currentMinute < end && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-20 border-t border-brand-red-ink" style={{ top: (currentMinute - start) * scale }} />
              )}
              {layoutTimelineItems(dayItems).map(({ item, lane, lanes }) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`${item.title}, ${prettyDate(day)}, ${formatTime(item.startTime)} to ${formatTime(item.endTime)}. View details`}
                  aria-pressed={selectedId === item.id}
                  onClick={() => onSelectEntry(item.entry)}
                  className={cn(
                    'absolute z-10 flex min-w-0 flex-col overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs outline-none hover:brightness-95 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    attendanceClassStyle(item.classType ?? item.title),
                    selectedId === item.id && 'ring-2 ring-inset ring-current'
                  )}
                  style={{
                    top: (timeMinutes(item.startTime) - start) * scale,
                    height: (timeMinutes(item.endTime) - timeMinutes(item.startTime)) * scale,
                    left: `calc(${lane / lanes * 100}% + 1px)`,
                    width: `calc(${100 / lanes}% - 2px)`
                  }}
                >
                  <span className="w-full truncate font-semibold">{item.title}</span>
                  <span className="w-full truncate text-[10px]">{formatTime(item.startTime)} – {formatTime(item.endTime)}</span>
                  <span className="w-full truncate text-[10px] opacity-85">{item.centre}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
