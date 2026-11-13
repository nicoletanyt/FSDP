import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Info, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import {
  addDays,
  classTypes,
  dateKey,
  formatTime,
  monthDates,
  weekDates,
  weekLabel
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
const views: AttendanceView[] = ['day', 'week', 'month']
const classStyles = new Map<string, string>(
  Object.values(classTypes).map(style => [style.label, style.card])
)

export function attendanceClassStyle(title: string) {
  return classStyles.get(title) ?? 'border-primary bg-primary/10 text-primary'
}

export function AttendanceToolbar({
  date, view, list, desktop, actions, onViewChange, onListChange, onNavigate, onToday
}: {
  date: Date
  view: AttendanceView
  list: boolean
  desktop: boolean
  actions: ReactNode
  onViewChange: (view: AttendanceView) => void
  onListChange: (list: boolean) => void
  onNavigate: (direction: number) => void
  onToday: () => void
}) {
  const heading = view === 'month'
    ? date.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
    : view === 'week' && desktop
      ? weekLabel(date)
      : prettyDate(date)
  const step = view === 'week' && !desktop ? 'day' : view

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {!list && (
        <div className="flex flex-wrap items-center gap-2 lg:gap-4">
          <div role="group" aria-label="Calendar navigation" className="flex items-center gap-2">
            <Button variant="outline" className="mr-1 h-11 px-4 lg:h-10" onClick={onToday}>Today</Button>
            <Button variant="ghost" size="icon-lg" className="size-11 lg:size-10" aria-label={`Previous ${step}`} onClick={() => onNavigate(-1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-lg" className="size-11 lg:size-10" aria-label={`Next ${step}`} onClick={() => onNavigate(1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <h3 className="w-full text-sm font-medium lg:w-auto" aria-live="polite">{heading}</h3>
        </div>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" className="h-11 min-w-28 justify-between gap-3 px-4 lg:h-10" />}
          aria-label={`Calendar view: ${viewLabels[view]}`}
        >
          {viewLabels[view]}
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="p-1.5">
          <DropdownMenuRadioGroup
            value={view}
            onValueChange={value => {
              const next = views.find(mode => mode === value)
              if (next) onViewChange(next)
            }}
            aria-label="Calendar view"
          >
            {views.map(mode => (
              <DropdownMenuRadioItem key={mode} value={mode} closeOnClick className="py-2.5 pr-4 pl-9">
                {viewLabels[mode]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" className="h-10 justify-between gap-2" />}
            aria-label={`Calendar display: ${list ? 'List' : view === 'month' ? 'Calendar' : 'Timeline'}`}
          >
            {list ? <List aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
            {list ? 'List' : view === 'month' ? 'Calendar' : 'Timeline'}
            <ChevronDown aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={list ? 'list' : 'calendar'} onValueChange={value => onListChange(value === 'list')} aria-label="Calendar display">
              <DropdownMenuRadioItem value="calendar" closeOnClick>{view === 'month' ? 'Calendar' : 'Timeline'}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="list" closeOnClick>List</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="icon" />} aria-label="Calendar legend">
            <Info aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-[min(24rem,70dvh)] overflow-auto">
            <PopoverTitle>Class colours</PopoverTitle>
            <ul className="flex flex-wrap gap-2">
              {Object.values(classTypes).map(style => (
                <li key={style.label} className={cn('rounded-md border px-2 py-1 text-xs', style.badge)}>{style.label}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
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
  date, today, view, desktop, entriesByDate, selectedId, onSelectDate, onSelectEntry
}: {
  date: Date
  today: Date
  view: AttendanceView
  desktop: boolean
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
    key={`${view}-${desktop}`}
    date={date}
    today={today}
    view={view}
    desktop={desktop}
    entriesByDate={entriesByDate}
    selectedId={selectedId}
    onSelectDate={onSelectDate}
    onSelectEntry={onSelectEntry}
  />
}

function AttendanceTimeline({
  date, today, view, desktop, entriesByDate, selectedId, onSelectDate, onSelectEntry
}: {
  date: Date
  today: Date
  view: 'day' | 'week'
  desktop: boolean
  entriesByDate: ReadonlyMap<string, AttendanceEntry[]>
  selectedId: string | null
  onSelectDate: (date: Date) => void
  onSelectEntry: (entry: AttendanceEntry) => void
}) {
  const week = weekDates(date)
  const days = view === 'day' ? [date] : desktop ? week : [date, addDays(date, 1)]
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
      {!desktop && (
        <div role="group" aria-label="Select a day" className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border">
          {week.map(day => (
            <DateButton key={dateKey(day)} day={day} date={date} today={today} onSelectDate={onSelectDate} className="min-h-12">
              <span className="truncate">{day.toLocaleDateString('en-SG', { weekday: 'short' })}</span>
            </DateButton>
          ))}
        </div>
      )}
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
