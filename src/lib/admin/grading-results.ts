import { supabase } from '@/lib/supabase'
import { decodeGradingDay } from '@/lib/instructor/grading-panels'
import type { GradingDay } from '@/lib/instructor/grading-panels'

// Administrators read grading days through the same function examiners use
// (it admits administrators), and examiners' batches through row security.

export const adminGradingKeys = {
  day: (eventId: string) => ['admin', 'grading-day', eventId] as const,
  summaries: (eventId: string) => ['admin', 'grading-batches', eventId] as const,
  results: (eventId: string, sessionId: string) => ['admin', 'grading-results', eventId, sessionId] as const,
}

export async function loadAdminGradingDay(eventId: string): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('examiner_grading_day', { target_event: eventId })
  if (error) throw new Error(error.code === '22023' ? 'This grading could not be found.' : 'Unable to load this grading day. Try again.')
  return decodeGradingDay(data)
}

// Errors from sorting and moving, in words an administrator can act on.
function sessionError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === 'PGS01') return error.message?.replace(/^Applications are still open$/, 'Applications are still open. Sort once they close.') ?? fallback
  if (error.code === 'PGS02') return 'An examiner has started grading, so sessions can no longer change.'
  if (error.code === '42501') return 'Only administrators can change grading sessions.'
  if (error.code === '22023') return error.message ?? fallback
  return fallback
}

// Generate a draft schedule from the scheduling rules. Returns the updated day.
export async function sortGradingSessions(eventId: string): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('sort_grading_sessions', { target_event: eventId })
  if (error) throw new Error(sessionError(error, 'Unable to sort candidates into sessions. Try again.'))
  return decodeGradingDay(data)
}

// Move one applicant into another session. Returns the updated day.
export async function moveGradingCandidate(applicationId: string, sessionId: string): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('move_grading_candidate', { target_application: applicationId, target_session: sessionId })
  if (error) throw new Error(sessionError(error, 'Unable to move this candidate. Try again.'))
  return decodeGradingDay(data)
}

// Move the chosen candidates into a new session straight after theirs.
export async function splitGradingSession(sessionId: string, applicationIds: string[]): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('split_grading_session', { target_session: sessionId, applications: applicationIds })
  if (error) throw new Error(sessionError(error, 'Unable to split this session. Try again.'))
  return decodeGradingDay(data)
}

// Move everyone in one session into another and remove the first.
export async function mergeGradingSessions(sourceId: string, intoId: string): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('merge_grading_sessions', { source_session: sourceId, into_session: intoId })
  if (error) throw new Error(sessionError(error, 'Unable to merge these sessions. Try again.'))
  return decodeGradingDay(data)
}

// An empty session at the end of the day (private gradings are scheduled by hand).
export async function addGradingSession(eventId: string): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('add_grading_session', { target_event: eventId })
  if (error) throw new Error(sessionError(error, 'Unable to add a session. Try again.'))
  return decodeGradingDay(data)
}

// Show the sessions to every examiner and release the reporting time.
export async function publishGradingSchedule(eventId: string): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('publish_grading_schedule', { target_event: eventId })
  if (error) throw new Error(sessionError(error, 'Unable to publish the schedule. Try again.'))
  return decodeGradingDay(data)
}

export async function unpublishGradingSchedule(eventId: string): Promise<GradingDay> {
  const { data, error } = await supabase.rpc('unpublish_grading_schedule', { target_event: eventId })
  if (error) throw new Error(sessionError(error, 'Unable to return the schedule to draft. Try again.'))
  return decodeGradingDay(data)
}

type Related<T> = T | T[] | null
const one = <T,>(value: Related<T>) => (Array.isArray(value) ? value[0] ?? null : value)
const personName = (value: Related<{ first_name: string; last_name: string }>) => {
  const person = one(value)
  return person ? `${person.first_name} ${person.last_name}`.trim() : 'Unknown instructor'
}

export interface BatchSummary {
  instructorId: string
  instructorName: string
  sessionId: string
  status: 'draft' | 'submitted'
  updatedAt: string
  submittedAt: string | null
}

interface SummaryRow {
  instructor_id: string
  session_id: string
  status: 'draft' | 'submitted'
  updated_at: string
  submitted_at: string | null
  instructors: Related<{ first_name: string; last_name: string }>
}

const summaryOf = (row: SummaryRow): BatchSummary => ({
  instructorId: row.instructor_id, instructorName: personName(row.instructors), sessionId: row.session_id,
  status: row.status, updatedAt: row.updated_at, submittedAt: row.submitted_at,
})

// Every examiner's batch status for a grading day, one row per examiner and session.
export async function loadBatchSummaries(eventId: string): Promise<BatchSummary[]> {
  const { data, error } = await supabase.from('grading_batches')
    .select('instructor_id,session_id,status,updated_at,submitted_at,instructors(first_name,last_name)')
    .eq('event_id', eventId)
  if (error) throw new Error('Unable to load examiners’ progress. Try again.')
  return ((data ?? []) as SummaryRow[]).map(summaryOf)
}

export interface ExaminerResults extends BatchSummary {
  students: { student_id: string; candidate_number: number; name: string; notes: string | null; target_grade_id: string }[]
  items: { syllabus_item_id: string; category: string; label: string; sort_order: number; grade_id: string }[]
  passed: Set<string>
}

interface ResultRow extends SummaryRow {
  grading_batch_students: { student_id: string; candidate_number: number; name: string; notes: string | null; target_grade_id: string;
    grading_batch_results: { syllabus_item_id: string; checked: boolean }[] }[]
  grading_batch_items: { syllabus_item_id: string; category: string; label: string; sort_order: number; grade_id: string }[]
}

export const resultKey = (studentId: string, itemId: string) => JSON.stringify([studentId, itemId])

// Each examiner's checklist for one session, with their marks and comments.
export async function loadSessionResults(eventId: string, sessionId: string): Promise<ExaminerResults[]> {
  const { data, error } = await supabase.from('grading_batches')
    .select(`instructor_id,session_id,status,updated_at,submitted_at,instructors(first_name,last_name),
      grading_batch_students(student_id,candidate_number,name,notes,target_grade_id,grading_batch_results(syllabus_item_id,checked)),
      grading_batch_items(syllabus_item_id,category,label,sort_order,grade_id)`)
    .eq('event_id', eventId).eq('session_id', sessionId)
  if (error) throw new Error('Unable to load examiners’ results. Try again.')
  return ((data ?? []) as ResultRow[]).map(row => ({
    ...summaryOf(row),
    students: row.grading_batch_students.map(({ grading_batch_results: _results, ...student }) => student)
      .sort((a, b) => a.candidate_number - b.candidate_number),
    items: [...row.grading_batch_items].sort((a, b) =>
      a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.syllabus_item_id.localeCompare(b.syllabus_item_id)),
    passed: new Set(row.grading_batch_students.flatMap(student => student.grading_batch_results
      .filter(result => result.checked).map(result => resultKey(student.student_id, result.syllabus_item_id)))),
  }))
}
