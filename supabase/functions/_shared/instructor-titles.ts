// Aikikai instructor titles and the grade rules for holding them. Shared by the
// browser and the create-instructor Edge Function so both apply the same rules.
// The CHECK constraint on public.instructors.instructor_title mirrors this list.
export const INSTRUCTOR_TITLES = ['none', 'fukushidoin', 'shidoin', 'shihan'] as const

export type InstructorTitle = typeof INSTRUCTOR_TITLES[number]
export type AwardedInstructorTitle = Exclude<InstructorTitle, 'none'>

export const instructorTitleLabels: Record<InstructorTitle, string> = {
  none: 'None',
  fukushidoin: 'Fuku-shidōin',
  shidoin: 'Shidōin',
  shihan: 'Shihan',
}

// Minimum dan for each title; a higher grade may hold a lower title.
export const minimumDanForTitle: Record<AwardedInstructorTitle, number> = {
  fukushidoin: 2,
  shidoin: 4,
  shihan: 6,
}

export function isInstructorTitle(value: unknown): value is InstructorTitle {
  return typeof value === 'string' && (INSTRUCTOR_TITLES as readonly string[]).includes(value)
}

// Reads the dan number from the grade id (e.g. '2nd-dan'). Never use belt
// colour: in Shinju-Kai 2nd and 1st kyu also wear black. Kyu grades,
// 'junior-dan' and 'unranked' are not dan grades.
export function danNumber(gradeId: string | null | undefined): number | null {
  const match = /^([1-9]\d*)(?:st|nd|rd|th)-dan$/.exec(gradeId ?? '')
  return match ? Number(match[1]) : null
}

export function allowedTitles(gradeId: string | null | undefined): InstructorTitle[] {
  const dan = danNumber(gradeId) ?? 0
  return INSTRUCTOR_TITLES.filter(title => title === 'none' || dan >= minimumDanForTitle[title])
}

export function isTitleAllowed(gradeId: string | null | undefined, title: InstructorTitle) {
  return allowedTitles(gradeId).includes(title)
}

function ordinal(value: number) {
  const tens = value % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'
  return `${value}${suffix}`
}

export function minimumDanLabel(title: AwardedInstructorTitle) {
  return `${ordinal(minimumDanForTitle[title])} dan`
}

export function titleRequirement(title: AwardedInstructorTitle) {
  return `Requires ${minimumDanLabel(title)} or above`
}
