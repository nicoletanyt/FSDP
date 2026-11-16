import { isDateOnly, singaporeDate } from './grading-fees'
import { gradingTrackForDob, type GradingTrack } from './grading-tracks'

type Grade = { id: string; label: string; sort_order: number }
type Track = { grade_id: string; track: string }
type Requirement = Track & { fee_cents: number | null }

/** Use the same calendar-year age and database ladder as grading checkout. */
export function gradingProgression(
  student: { current_grade_id: string; date_of_birth: string },
  grades: Grade[], tracks: Track[], requirements: Requirement[], today = singaporeDate(),
  authoritativeTarget?: { target_grade_id: string; track: GradingTrack },
) {
  const current = grades.find((grade) => grade.id === student.current_grade_id)
  if (!current) throw new Error('Your current rank is missing from the grade catalogue. Please contact your dojo.')
  if (!isDateOnly(student.date_of_birth) || student.date_of_birth > today) {
    throw new Error('Your date of birth is missing or invalid. Please contact your dojo to confirm your grading track.')
  }
  const studentTrack = gradingTrackForDob(student.date_of_birth, today)!
  const track = authoritativeTarget?.track ?? studentTrack
  const target = authoritativeTarget ? grades.find(grade => grade.id === authoritativeTarget.target_grade_id) ?? null : grades.filter((grade) => grade.sort_order > current.sort_order &&
    tracks.some((entry) => entry.grade_id === grade.id && entry.track === track))
     .sort((a, b) => a.sort_order - b.sort_order)[0] ?? null
  if (authoritativeTarget && (!target || !tracks.some(entry => entry.grade_id === target.id && entry.track === track))) {
    throw new Error('Your next grade or grading track is missing from the catalogue. Please contact your dojo.')
  }
  const fee = requirements.find((entry) => entry.grade_id === target?.id && entry.track === track)?.fee_cents
  return { current, target, track, studentTrack, feeCents: fee != null && fee > 0 ? fee : null }
}
