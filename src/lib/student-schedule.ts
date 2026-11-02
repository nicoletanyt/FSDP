import { classTemplates, addDays, dateKey, formatTime } from '@/lib/instructor-calendar'
export { addDays } from '@/lib/instructor-calendar'

export type ClassOffering = {
  id: string
  templateId: string
  date: Date
  dateId: string
  title: string
  centre: string
  instructor: string
  startTime: string
  endTime: string
  level: string
  capacity: number
  occupied: number
}
export type Enrollment = { id: string; status: 'enrolled' | 'attended' | 'missed' | 'make-up'; movedFrom?: string }
export const beltRanks = ['White belt', 'Yellow belt', 'Orange belt', 'Green belt', 'Blue belt', 'Brown belt', 'Black belt'] as const
export type BeltRank = typeof beltRanks[number]
const levels: Record<string, number> = { 'Children Beginners': 0, Adults: 1, Intermediate: 2, Advanced: 4, 'Mixed/Family': 0, Weapons: 4 }
const capacity: Record<string, number> = { 'Children Beginners': 16, Adults: 18, Intermediate: 16, Advanced: 12, 'Mixed/Family': 22, Weapons: 12 }

export function requiredLevel(title: string) { return levels[title] ?? 0 }
export function beltIndex(belt: BeltRank) { return beltRanks.indexOf(belt) }
export function isEligible(offering: ClassOffering, belt: BeltRank) { return beltIndex(belt) >= requiredLevel(offering.title) }
export function isRecommended(offering: ClassOffering, belt: BeltRank) {
  const rank = beltIndex(belt)
  const threshold = requiredLevel(offering.title)
  return isEligible(offering, belt) && (offering.title === 'Mixed/Family' || (rank <= 1 && threshold === 0) || (rank >= 2 && rank <= 3 && threshold === 2) || (rank >= 4 && threshold === 4))
}
export function dateTime(session: ClassOffering) { return new Date(`${session.dateId}T${session.startTime}:00`) }
export function prettyDate(date: Date) { return date.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }
export { formatTime }

// Class templates currently come from the shared instructor demo fixtures, not a live schedule table.
export function getOfferings(from = addDays(new Date(), -35), days = 85): ClassOffering[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const all: ClassOffering[] = []
  for (let offset = 0; offset < days; offset++) {
    const day = addDays(start, offset)
    for (const template of classTemplates) {
      if (template.type !== 'training' || template.weekday !== day.getDay()) continue
      const dateId = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      all.push({
        id: `${template.id}-${dateKey(day)}`,
        templateId: template.id,
        date: day,
        dateId,
        title: template.name,
        centre: template.dojo,
        instructor: template.instructorId === 'instructor-1' ? 'Alex Morgan' : 'Jamie Chen',
        startTime: template.startTime,
        endTime: template.endTime,
        level: template.name === 'Mixed/Family' ? 'All belt levels' : beltRanks[requiredLevel(template.name)] + ' and above',
        capacity: capacity[template.name] ?? 16,
        occupied: template.studentIds.length,
      })
    }
  }
  return all.sort((a, b) => dateTime(a).getTime() - dateTime(b).getTime())
}

export function conflict(a: ClassOffering, b: ClassOffering) {
  return a.dateId === b.dateId && a.startTime < b.endTime && b.startTime < a.endTime
}