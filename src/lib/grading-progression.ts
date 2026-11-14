import { isDateOnly, singaporeDate } from './grading-fees'

type Grade = { id: string; label: string; sort_order: number }
type Track = { grade_id: string; track: string }
type Requirement = Track & { fee_cents: number | null }

/** Use the same calendar-year age and database ladder as grading checkout. */
export function gradingProgression(
  student: { current_grade_id: string; date_of_birth: string },
  grades: Grade[], tracks: Track[], requirements: Requirement[], today = singaporeDate(),
) {
  const current = grades.find((grade) => grade.id === student.current_grade_id)
  if (!current) throw new Error('Your current rank is missing from the grade catalogue. Please contact your dojo.')
  if (!isDateOnly(student.date_of_birth) || student.date_of_birth > today) {
    throw new Error('Your date of birth is missing or invalid. Please contact your dojo to confirm your grading track.')
  }
  const track = Number(today.slice(0, 4)) - Number(student.date_of_birth.slice(0, 4)) >= 13 ? 'adult' : 'children'
  const target = grades.filter((grade) => grade.sort_order > current.sort_order &&
    tracks.some((entry) => entry.grade_id === grade.id && entry.track === track))
    .sort((a, b) => a.sort_order - b.sort_order)[0] ?? null
  const fee = requirements.find((entry) => entry.grade_id === target?.id && entry.track === track)?.fee_cents
  return { current, target, feeCents: fee != null && fee > 0 ? fee : null }
}
