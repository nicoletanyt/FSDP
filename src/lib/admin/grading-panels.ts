import type { SupabaseClient } from '@supabase/supabase-js'

export interface PanelMember {
  instructorId: string
  isChief: boolean
  name: string
}

export interface Examiner {
  id: string
  name: string
}

type PanelClient = Pick<SupabaseClient, 'from' | 'rpc'>

// Embedded on a gradings select: one row per examiner on that grading's panel.
export const panelSelect = 'grading_panel_members(instructor_id, is_chief, added_at, instructors(first_name, last_name))'

interface PanelRow {
  instructor_id: string
  is_chief: boolean
  added_at: string
  instructors: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
}

function personName(value: PanelRow['instructors']) {
  const person = Array.isArray(value) ? value[0] : value
  return person ? `${person.first_name} ${person.last_name}`.trim() : 'Unknown instructor'
}

// Chief first, then in the order they joined.
export function toPanel(rows: PanelRow[] | null | undefined): PanelMember[] {
  return [...(rows ?? [])]
    .sort((left, right) => Number(right.is_chief) - Number(left.is_chief) || left.added_at.localeCompare(right.added_at))
    .map(row => ({ instructorId: row.instructor_id, isChief: row.is_chief, name: personName(row.instructors) }))
}

export function panelErrorMessage(error: unknown, fallback: string) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code === 'PGP02') return 'Only instructors marked as examiners can sit on a grading panel.'
  if (code === 'PGP03') return 'This instructor is on a scheduled grading panel. Remove them from it first.'
  if (code === 'PGP04') return 'The chief examiner must be on the panel.'
  if (code === '42501') return 'Only administrators can change grading panels.'
  return fallback
}

export async function loadExaminers(client: PanelClient): Promise<Examiner[]> {
  const { data, error } = await client.from('instructors').select('id, first_name, last_name')
    .eq('is_examiner', true).order('first_name').order('last_name')
  if (error) throw new Error('Unable to load examiners. Try again.')
  return (data ?? []).map(row => ({ id: row.id as string, name: `${row.first_name} ${row.last_name}`.trim() }))
}

export async function saveGradingPanel(client: PanelClient, eventId: string, examinerIds: string[], chiefId: string | null) {
  const { error } = await client.rpc('set_grading_panel', {
    target_event: eventId, examiner_ids: examinerIds, chief_id: chiefId,
  })
  if (error) throw new Error(panelErrorMessage(error, 'Unable to save the grading panel. Try again.'))
}

export async function setExaminer(client: PanelClient, instructorId: string, isExaminer: boolean) {
  const { data, error } = await client.from('instructors').update({ is_examiner: isExaminer })
    .eq('id', instructorId).select('is_examiner').maybeSingle()
  if (error) throw new Error(panelErrorMessage(error, 'Unable to update the examiner status. Try again.'))
  if (!data || data.is_examiner !== isExaminer) throw new Error('The examiner status was not saved. Try again.')
  return data.is_examiner as boolean
}
