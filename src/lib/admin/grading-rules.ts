import { supabase } from '@/lib/supabase'

// Scheduling rules the grading-day scheduler reads. Administrators only (row security).

export type GradeTrack = 'children' | 'adult'

export interface ScheduleRules {
  track: GradeTrack
  defaultCapacity: number
  minSessionSize: number
  defaultSessionMinutes: number
  dayStart: string
  dayEnd: string
  lunchStart: string
  lunchEnd: string
  changeoverMinutes: number
}

export interface SessionDuration {
  id: string
  track: GradeTrack
  fromGradeId: string | null
  toGradeId: string
  minutes: number
}

export interface RuleGrade {
  id: string
  label: string
  sortOrder: number
  tracks: GradeTrack[]
}

export const gradingRulesKeys = {
  all: ['admin', 'grading-rules'] as const,
}

interface RulesRow {
  track: GradeTrack
  default_capacity: number
  min_session_size: number
  default_session_minutes: number
  day_start: string
  day_end: string
  lunch_start: string
  lunch_end: string
  changeover_minutes: number
}

interface DurationRow { id: string; track: GradeTrack; from_grade_id: string | null; to_grade_id: string; minutes: number }
interface GradeRow { id: string; label: string; sort_order: number; grade_tracks: { track: GradeTrack }[] | null }

// Postgres returns times as HH:MM:SS; the form edits HH:MM.
const clock = (value: string) => value.slice(0, 5)

export async function loadGradingRules(): Promise<{ rules: ScheduleRules[]; durations: SessionDuration[]; grades: RuleGrade[] }> {
  const [rules, durations, grades] = await Promise.all([
    supabase.from('grading_schedule_rules').select('track,default_capacity,min_session_size,default_session_minutes,day_start,day_end,lunch_start,lunch_end,changeover_minutes'),
    supabase.from('grading_session_durations').select('id,track,from_grade_id,to_grade_id,minutes'),
    supabase.from('grades').select('id,label,sort_order,grade_tracks(track)').order('sort_order'),
  ])
  if (rules.error || durations.error || grades.error) throw new Error('Unable to load the scheduling rules. Try again.')
  return {
    rules: ((rules.data ?? []) as RulesRow[]).map(row => ({
      track: row.track, defaultCapacity: row.default_capacity, minSessionSize: row.min_session_size,
      defaultSessionMinutes: row.default_session_minutes, dayStart: clock(row.day_start), dayEnd: clock(row.day_end),
      lunchStart: clock(row.lunch_start), lunchEnd: clock(row.lunch_end), changeoverMinutes: row.changeover_minutes,
    })).sort((a, b) => a.track.localeCompare(b.track)),
    durations: ((durations.data ?? []) as DurationRow[]).map(row => ({
      id: row.id, track: row.track, fromGradeId: row.from_grade_id, toGradeId: row.to_grade_id, minutes: row.minutes,
    })),
    grades: ((grades.data ?? []) as GradeRow[]).map(row => ({
      id: row.id, label: row.label, sortOrder: row.sort_order, tracks: (row.grade_tracks ?? []).map(item => item.track),
    })),
  }
}

// Times must fit inside the day, with lunch inside it; the database checks the same.
export function rulesProblem(rules: ScheduleRules): string | null {
  const whole = [rules.defaultCapacity, rules.minSessionSize, rules.defaultSessionMinutes]
  if (whole.some(value => !Number.isInteger(value) || value < 1)) return 'Capacity, minimum session size and default length must be whole numbers above zero.'
  if (!Number.isInteger(rules.changeoverMinutes) || rules.changeoverMinutes < 0 || rules.changeoverMinutes > 120) return 'Changeover must be 0–120 minutes.'
  if (rules.defaultSessionMinutes < 5 || rules.defaultSessionMinutes > 600) return 'The default session length must be 5–600 minutes.'
  if (!(rules.dayStart < rules.dayEnd)) return 'The day must end after it starts.'
  if (!(rules.lunchStart < rules.lunchEnd) || rules.lunchStart < rules.dayStart || rules.lunchEnd > rules.dayEnd) return 'Lunch must be inside the day and end after it starts.'
  return null
}

export async function saveGradingRules(rules: ScheduleRules): Promise<void> {
  const problem = rulesProblem(rules)
  if (problem) throw new Error(problem)
  const { error } = await supabase.from('grading_schedule_rules').update({
    default_capacity: rules.defaultCapacity, min_session_size: rules.minSessionSize,
    default_session_minutes: rules.defaultSessionMinutes, day_start: rules.dayStart, day_end: rules.dayEnd,
    lunch_start: rules.lunchStart, lunch_end: rules.lunchEnd, changeover_minutes: rules.changeoverMinutes,
    updated_at: new Date().toISOString(),
  }).eq('track', rules.track)
  if (error) throw new Error('Unable to save the scheduling rules. Try again.')
}

export async function saveSessionDuration(duration: Omit<SessionDuration, 'id'> & { id?: string }): Promise<void> {
  if (!Number.isInteger(duration.minutes) || duration.minutes < 5 || duration.minutes > 600) throw new Error('Session lengths must be 5–600 minutes.')
  const row = { track: duration.track, from_grade_id: duration.fromGradeId, to_grade_id: duration.toGradeId, minutes: duration.minutes }
  const { error } = duration.id
    ? await supabase.from('grading_session_durations').update(row).eq('id', duration.id)
    : await supabase.from('grading_session_durations').insert(row)
  if (error) throw new Error(error.code === '23505' ? 'That transition already has a length.' : 'Unable to save the session length. Try again.')
}

export async function deleteSessionDuration(id: string): Promise<void> {
  const { error } = await supabase.from('grading_session_durations').delete().eq('id', id)
  if (error) throw new Error('Unable to remove the session length. Try again.')
}
