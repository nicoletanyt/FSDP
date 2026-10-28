const dateFormatter = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const shortDateFormatter = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
})

const weekdayFormatter = new Intl.DateTimeFormat('en-SG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export function startOfDay(date = new Date()): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayIso(): string {
  return toIsoDate(startOfDay())
}

export function daysAgoIso(days: number): string {
  return toIsoDate(addDays(startOfDay(), -days))
}

export function daysAheadIso(days: number): string {
  return toIsoDate(addDays(startOfDay(), days))
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  return dateFormatter.format(new Date(`${iso}T00:00:00`))
}

export function formatShortDate(iso: string): string {
  if (!iso) return '—'
  return shortDateFormatter.format(new Date(`${iso}T00:00:00`))
}

export function formatWeekday(iso: string): string {
  if (!iso) return '—'
  return weekdayFormatter.format(new Date(`${iso}T00:00:00`))
}

export function formatDateTime(iso: string, time?: string): string {
  return time ? `${formatDate(iso)} · ${time}` : formatDate(iso)
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`
}

export function formatSignedPercent(value: number): string {
  const rounded = Math.round(value)
  if (rounded === 0) return '0 pts'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} pts`
}

export function relativeDay(iso: string): string {
  if (!iso) return 'Never'
  const target = new Date(`${iso}T00:00:00`).getTime()
  const today = startOfDay().getTime()
  const diff = Math.round((target - today) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return `${Math.abs(diff)} days ago`
  return `In ${diff} days`
}

export function monthsBetween(iso: string, reference = todayIso()): number {
  const start = new Date(`${iso}T00:00:00`)
  const end = new Date(`${reference}T00:00:00`)
  return Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) -
      (end.getDate() < start.getDate() ? 1 : 0),
  )
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime()
  const to = new Date(`${toIso}T00:00:00`).getTime()
  return Math.round((to - from) / 86_400_000)
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`
}

export function titleCase(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}
