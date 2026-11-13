import { supabase } from '@/lib/supabase'
import { decodeGradingDay } from '@/lib/instructor/grading-panels'
import type { GradingDay } from '@/lib/instructor/grading-panels'
import * as checklists from '@/lib/grading/checklist-results'

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

export { resultKey } from '@/lib/grading/checklist-results'
export type { BatchSummary, ExaminerResults } from '@/lib/grading/checklist-results'

export const loadBatchSummaries = (eventId: string) => checklists.loadBatchSummaries(supabase, eventId)
export const loadSessionResults = (eventId: string, sessionId: string) => checklists.loadSessionResults(supabase, eventId, sessionId)
