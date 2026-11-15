import type { ScanFeedback } from '@/components/instructor/CheckInScanner'
import type { NfcScanResult } from '@/lib/nfc-check-in'

export function nfcCheckInFeedback(result: NfcScanResult): ScanFeedback {
  const name = result.student_name?.trim() || 'This student'
  const className = result.class_name ? ` for ${result.class_name}` : ''
  switch (result.status) {
    case 'marked':
      return result.already_marked
        ? { tone: 'duplicate', title: 'Already checked in', description: `${name} is already on the attendance list${className}.` }
        : { tone: 'success', title: name, description: `You’re checked in${className}. Welcome to class!` }
    case 'upcoming':
      return { tone: 'invalid', title: 'Check-in not open yet', description: `${name}’s check-in${className} opens 10 minutes before class.` }
    case 'absent':
      return { tone: 'invalid', title: 'Check-in closed', description: `${name} is recorded absent or this class has ended. No attendance was changed.` }
    case 'excused':
      return { tone: 'duplicate', title: 'Marked excused', description: `${name} is already excused${className}. No attendance was changed.` }
    case 'no_class':
      return { tone: 'invalid', title: 'No class today', description: `${name} has no class assigned to you today.` }
    case 'wrong_class':
      return { tone: 'invalid', title: 'Different class', description: `${name} is not booked into that class. No attendance was changed.` }
    case 'forbidden':
      return { tone: 'invalid', title: 'Not your class', description: 'Only the instructor teaching this class can check students in.' }
    case 'unlinked':
      return { tone: 'invalid', title: 'Instructor not linked', description: 'Your instructor account is not linked to a teaching record.' }
    default:
      return { tone: 'invalid', title: 'Invalid NFC tag', description: 'This tag is not recognised. Ask an administrator for a replacement.' }
  }
}
