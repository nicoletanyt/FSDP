import { supabase } from '@/lib/supabase'

export type CoverInvitationReceipt = { instructor_id: string; status: string }

export const coverInvitationsKey = (eventId: string) => ['admin', 'cover-invitations', eventId] as const

export async function loadCoverInvitations(eventId: string): Promise<CoverInvitationReceipt[]> {
  const { data, error } = await supabase.from('class_cover_test_invitations')
    .select('instructor_id,status').eq('event_id', eventId)
  if (error) throw error
  return data ?? []
}
