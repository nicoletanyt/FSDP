import type { SupabaseClient } from '@supabase/supabase-js'

// Grading checklist reads shared by the admin results page and the instructor
// "View checklists" page. Row security decides which examiners' batches come back:
// administrators see all, the chief examiner sees submitted panel batches, and
// other examiners see only their own.
type Client = Pick<SupabaseClient, 'from'>

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
export async function loadBatchSummaries(client: Client, eventId: string): Promise<BatchSummary[]> {
  const { data, error } = await client.from('grading_batches')
    .select('instructor_id,session_id,status,updated_at,submitted_at,instructors(first_name,last_name)')
    .eq('event_id', eventId)
  if (error) throw new Error('Unable to load examiners’ progress. Try again.')
  return ((data ?? []) as SummaryRow[]).map(summaryOf)
}

export interface ExaminerResults extends BatchSummary {
  students: { student_id: string; candidate_number: number; name: string; notes: string | null; target_grade_id: string }[]
  items: { syllabus_item_id: string; category: string; label: string; sort_order: number; grade_id: string }[]
  // Each marked cell's letter, by resultKey(student, item); a missing cell is blank.
  marks: Map<string, 'A' | 'B' | 'C'>
}

interface ResultRow extends SummaryRow {
  grading_batch_students: { student_id: string; candidate_number: number; name: string; notes: string | null; target_grade_id: string;
    grading_batch_results: { syllabus_item_id: string; grade: 'A' | 'B' | 'C' | null }[] }[]
  grading_batch_items: { syllabus_item_id: string; category: string; label: string; sort_order: number; grade_id: string }[]
}

export const resultKey = (studentId: string, itemId: string) => JSON.stringify([studentId, itemId])

// Each examiner's checklist for one session, with their marks and comments.
export async function loadSessionResults(client: Client, eventId: string, sessionId: string): Promise<ExaminerResults[]> {
  const { data, error } = await client.from('grading_batches')
    .select(`instructor_id,session_id,status,updated_at,submitted_at,instructors(first_name,last_name),
      grading_batch_students(student_id,candidate_number,name,notes,target_grade_id,grading_batch_results(syllabus_item_id,grade)),
      grading_batch_items(syllabus_item_id,category,label,sort_order,grade_id)`)
    .eq('event_id', eventId).eq('session_id', sessionId)
  if (error) throw new Error('Unable to load examiners’ results. Try again.')
  return ((data ?? []) as ResultRow[]).map(row => ({
    ...summaryOf(row),
    students: row.grading_batch_students.map(({ grading_batch_results: _results, ...student }) => student)
      .sort((a, b) => a.candidate_number - b.candidate_number),
    items: [...row.grading_batch_items].sort((a, b) =>
      a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.syllabus_item_id.localeCompare(b.syllabus_item_id)),
    marks: new Map(row.grading_batch_students.flatMap(student => student.grading_batch_results
      .filter(result => result.grade !== null).map(result => [resultKey(student.student_id, result.syllabus_item_id), result.grade!] as const))),
  }))
}
