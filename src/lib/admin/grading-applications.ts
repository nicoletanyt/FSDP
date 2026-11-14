import { supabase } from '@/lib/supabase'
import type { GradeRow } from '@/lib/instructor/types'

export interface GradingApplication {
  id: string
  submitted_at: string
  target_grade_id: string
  students: ApplicationStudent | ApplicationStudent[]
  gradings: { grading_date: string | null; events: ApplicationEvent | ApplicationEvent[] }
    | { grading_date: string | null; events: ApplicationEvent | ApplicationEvent[] }[]
}

interface ApplicationStudent {
  first_name: string
  last_name: string
  member_no: string
  current_grade_id: string
}

interface ApplicationEvent { name: string }

export const gradingApplicationsKey = (userId: string | undefined) =>
  ['admin', 'grading-applications', userId] as const

export const gradingApplicationGradesKey = (userId: string | undefined) =>
  ['admin', 'grading-application-grades', userId] as const

export async function loadGradingApplications(): Promise<GradingApplication[]> {
  const { data, error } = await supabase.from('grading_applications')
    .select('id,submitted_at,target_grade_id,students(first_name,last_name,member_no,current_grade_id),gradings(grading_date,events(name))')
    .order('submitted_at', { ascending: false })
  if (error) throw new Error('Unable to load grading applications and grades.')
  return (data ?? []) as GradingApplication[]
}

export async function loadGradingApplicationGrades(): Promise<GradeRow[]> {
  const { data, error } = await supabase.from('grades').select('id,label,colour,is_ranked,sort_order')
  if (error) throw new Error('Unable to load grading applications and grades.')
  return (data ?? []) as GradeRow[]
}

export function missingApplicationGrade(applications: GradingApplication[], grades: Map<string, GradeRow>) {
  return applications.some(item => {
    const student = Array.isArray(item.students) ? item.students[0] : item.students
    return !grades.has(item.target_grade_id) || (student && !grades.has(student.current_grade_id))
  })
}
