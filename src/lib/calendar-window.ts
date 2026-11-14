// On mid-width screens a 7-day week is too cramped to read, so the week view
// shows `span` days (2, 3 or 4) starting today: today and the days after it.
// While the selected day stays inside that window the columns don't move, so
// clicking a day or class never shifts them. Selecting a day outside it (or
// stepping) starts a new window on that day.
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function anchorOf(date: Date, today: Date, span: number, add: (date: Date, days: number) => Date) {
  for (let offset = 0; offset < span; offset++) if (sameDay(date, add(today, offset))) return today
  return date
}

/** The days to show: the full Mon–Sun `week` when it fits, else `span` days from the anchor. */
export function visibleWeekDays(
  date: Date, today: Date, week: Date[], span: number, add: (date: Date, days: number) => Date,
): Date[] {
  if (span >= week.length) return week
  const anchor = anchorOf(date, today, span, add)
  return Array.from({ length: span }, (_, index) => add(anchor, index))
}

/** The date to move to when stepping the week view forward (1) or back (-1). */
export function stepWeekWindow(
  date: Date, direction: 1 | -1, today: Date, span: number, add: (date: Date, days: number) => Date,
): Date {
  if (span >= 7) return add(date, direction * 7)
  return add(anchorOf(date, today, span, add), direction * span)
}

/** The whole Mon–Sun weeks that cover `days`, so one fetch holds every visible day. */
export function weeksCovering(days: Date[], weekOf: (date: Date) => Date[]): Date[] {
  const first = weekOf(days[0])
  const last = weekOf(days[days.length - 1])
  return first[0].getTime() === last[0].getTime() ? first : [...first, ...last]
}

/** "9 Nov – 12 Nov 2026" for the days on screen. */
export function windowLabel(days: Date[]): string {
  const start = days[0]
  const end = days[days.length - 1]
  const startLabel = start.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(start.getFullYear() !== end.getFullYear() ? { year: 'numeric' } : {}),
  })
  const endLabel = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}
