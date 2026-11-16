import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChecklistRequirement } from '@/components/grading/EligibilityChecklist'
import type { GradingCheckoutOption } from '@/lib/grading-checkout'
import { gradingProgression } from '@/lib/grading-progression'

export type Readiness = ChecklistRequirement & {
  target_grade_id: string
  target_grade_label: string
}
export type ApplicationDraft = {
  id: string
  target_grade_id: string
  status: string
  created_at: string
  base_fee_cents: number
}
export type StudentGradingData = {
  options: GradingCheckoutOption[]
  readiness: Readiness[]
  drafts: ApplicationDraft[]
  progression: ReturnType<typeof gradingProgression>
}

/** Everything the grading application page needs, read in parallel. */
export async function loadStudentGradingData(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<StudentGradingData> {
  const results = await Promise.all([
    client.rpc('my_grading_checkout_options').abortSignal(signal),
    client.rpc('my_grading_readiness').abortSignal(signal),
    client.from('students').select('current_grade_id,date_of_birth').eq('user_id', userId).abortSignal(signal).maybeSingle(),
    client.from('grades').select('id,label,sort_order').abortSignal(signal),
    client.from('grade_tracks').select('grade_id,track').abortSignal(signal),
    client.from('grade_requirements').select('grade_id,track,fee_cents').abortSignal(signal),
    client.from('grading_application_drafts').select('id,target_grade_id,status,created_at,base_fee_cents')
      .eq('user_id', userId).order('created_at', { ascending: false }).abortSignal(signal),
  ])
  if (results.some((result) => result.error)) {
    throw new Error('Unable to load your grading records. Please try again.')
  }
  const [events, ready, student, grades, tracks, requirements, drafts] = results
  if (!student.data) {
    throw new Error('No student record is linked to your account. Please contact your dojo to record your current rank.')
  }
  return {
    progression: gradingProgression(student.data, grades.data ?? [], tracks.data ?? [], requirements.data ?? []),
    options: (events.data ?? []) as GradingCheckoutOption[],
    readiness: (ready.data ?? []) as Readiness[],
    drafts: drafts.data ?? [],
  }
}
