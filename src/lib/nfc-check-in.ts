import { supabase } from '@/lib/supabase'

export interface NfcClass {
  event_id: string
  class_name: string
  starts_at: string
  ends_at: string
}

export interface NfcScanResult {
  status: 'marked' | 'upcoming' | 'absent' | 'excused' | 'no_class' | 'select_class' |
    'invalid' | 'wrong_class' | 'forbidden' | 'unlinked'
  student_name?: string
  class_name?: string
  starts_at?: string
  ends_at?: string
  already_marked?: boolean
  classes?: NfcClass[]
}

export async function scanNfcTag(tag: string, eventId?: string): Promise<NfcScanResult> {
  const { data, error } = await supabase.functions.invoke<NfcScanResult>('nfc-check-in', {
    body: { action: 'scan', tag, ...(eventId ? { event_id: eventId } : {}) },
  })
  if (error) {
    const response = 'context' in error && error.context instanceof Response ? error.context : null
    const details = await response?.json().catch(() => null)
    if (['invalid', 'wrong_class', 'unlinked', 'forbidden'].includes(details?.status)) return details as NfcScanResult
    throw new Error(typeof details?.error === 'string' ? details.error : 'Unable to check attendance. Try again.')
  }
  if (!data?.status) throw new Error('Unable to check attendance. Try again.')
  return data
}
