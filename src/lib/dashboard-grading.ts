import type { SupabaseClient } from '@supabase/supabase-js'

type Application = { target_grade_id: string; status: string }
type Draft = Application & { created_at: string }

export function dashboardGradingStatus(applications: Application[], drafts: Draft[]) {
  const active = applications.filter((row) => ['submitted', 'under_review'].includes(row.status))
  // Checkout retries can create several drafts for the same target grade.
  // Count the latest one only; a submitted application supersedes its draft.
  const submittedTargets = new Set(active.map((row) => row.target_grade_id))
  const latest = new Map<string, Draft>()
  for (const draft of drafts) {
    if (submittedTargets.has(draft.target_grade_id)) continue
    const previous = latest.get(draft.target_grade_id)
    const priority = (row: Draft) => row.status === 'pending_review' ? 2 : row.status === 'preview_paid' ? 1 : 0
    if (!previous || priority(draft) > priority(previous) ||
      (priority(draft) === priority(previous) && draft.created_at > previous.created_at)) latest.set(draft.target_grade_id, draft)
  }
  const parts: string[] = []
  const submitted = active.filter((row) => row.status === 'submitted').length
  const reviewing = active.filter((row) => row.status === 'under_review').length
  if (submitted) parts.push(`${submitted} submitted`)
  if (reviewing) parts.push(`${reviewing} under review`)
  const saved = [...latest.values()]
  const paid = saved.filter((draft) => draft.status === 'pending_review').length
  const verifying = saved.filter((draft) => draft.status === 'preview_paid').length
  const unpaid = saved.length - paid - verifying
  if (paid) parts.push(`${paid} payment confirmed — awaiting dojo review`)
  if (verifying) parts.push(`${verifying} payment verification pending — do not pay again`)
  if (unpaid) parts.push(`${unpaid} ${unpaid === 1 ? 'draft' : 'drafts'} saved — not submitted`)
  return { status: parts.join(' · ') || 'No pending actions', badge: active.length + latest.size }
}

export async function loadDashboardGrading(client: Pick<SupabaseClient, 'from'>, userId: string, signal: AbortSignal) {
  const student = await client.from('students').select('id').eq('user_id', userId).abortSignal(signal).maybeSingle()
  if (student.error) throw student.error
  if (!student.data) return { status: 'Membership record required', badge: 0 }
  const [applications, drafts] = await Promise.all([
    client.from('grading_applications').select('target_grade_id,status')
      .eq('student_id', student.data.id).in('status', ['submitted', 'under_review']).abortSignal(signal),
    client.from('grading_application_drafts').select('target_grade_id,status,created_at')
      .eq('user_id', userId).abortSignal(signal),
  ])
  if (applications.error || drafts.error) throw applications.error ?? drafts.error
  return dashboardGradingStatus(applications.data ?? [], drafts.data ?? [])
}
