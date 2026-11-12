import type { ScanFeedback } from '@/components/instructor/CheckInScanner'
import { supabase } from '@/lib/supabase'
import { requestInstructorData } from './api'

/** Statuses returned by public.check_in_with_qr (see the student_attendance_qr migration). */
export type QrCheckInStatus =
  | 'marked' | 'invalid' | 'expired' | 'wrong_class' | 'not_booked' | 'excused'
  | 'cancelled' | 'upcoming' | 'absent' | 'forbidden'

export type QrCheckInResult = { status: QrCheckInStatus; studentName: string | null; alreadyMarked: boolean }

const statuses: readonly QrCheckInStatus[] = [
  'marked', 'invalid', 'expired', 'wrong_class', 'not_booked', 'excused', 'cancelled', 'upcoming', 'absent', 'forbidden',
]

export function parseQrCheckIn(value: unknown): QrCheckInResult {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const status = statuses.find(item => item === row.status) ?? 'invalid'
  return {
    status,
    studentName: typeof row.student_name === 'string' && row.student_name.trim() ? row.student_name : null,
    alreadyMarked: row.already_marked === true,
  }
}

/** The database verifies the signature, the minute and the booking, then marks the student present. */
export async function checkInWithQr(payload: string, eventId: string): Promise<QrCheckInResult> {
  const data = await requestInstructorData(
    () => supabase.rpc('check_in_with_qr', { p_payload: payload.trim(), p_event: eventId }),
    'Unable to check this student in. Please try again.',
  )
  return parseQrCheckIn(data)
}

/** What the scanner overlay shows for each outcome. */
export function qrCheckInFeedback(result: QrCheckInResult): ScanFeedback {
  const name = result.studentName ?? 'This student'
  switch (result.status) {
    case 'marked':
      return result.alreadyMarked
        ? { tone: 'duplicate', title: 'Already checked in', description: `${name} is already on today’s attendance list.` }
        : { tone: 'success', title: name, description: 'You’re checked in. Welcome to class!' }
    case 'expired':
      return { tone: 'invalid', title: 'QR code expired', description: 'Ask the student to reopen their attendance QR for a fresh code.' }
    case 'wrong_class':
      return { tone: 'invalid', title: 'Different class', description: `${name}’s code is for another class. Check the selected session.` }
    case 'not_booked':
      return { tone: 'invalid', title: 'Not booked', description: `${name} is not booked into this class.` }
    case 'excused':
      return { tone: 'duplicate', title: 'Marked excused', description: `${name} is already excused from this class.` }
    case 'cancelled':
      return { tone: 'invalid', title: 'Class cancelled', description: 'This class has been cancelled, so check-in is closed.' }
    case 'upcoming':
      return { tone: 'invalid', title: 'Check-in not open yet', description: 'Check-in opens 10 minutes before class starts.' }
    case 'absent':
      return { tone: 'invalid', title: 'Check-in closed', description: `${name} is recorded absent or the class has ended. Update attendance from the class page.` }
    case 'forbidden':
      return { tone: 'invalid', title: 'Not your class', description: 'Only the instructor teaching this class can check students in.' }
    default:
      return { tone: 'invalid', title: 'QR code not recognised', description: 'Ask the student to open their attendance QR on the ASK student dashboard.' }
  }
}
