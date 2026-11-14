import { supabase } from '@/lib/supabase'

type SendStatus = 'pending' | 'accepted' | 'failed'

interface GradingSend {
  id: string
  grading_event_id: string | null
  event_name: string | null
  status: SendStatus
  recipient_count: number
  created_at: string
  error: string | null
}

interface AttendanceSend {
  id: string
  student_id: string
  status: SendStatus
  created_at: string
  error: string | null
  students: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
}

export type SentEmail = {
  id: string
  date: string
  type: 'grading' | 'attendance'
  sentTo: string
  status: SendStatus
  error: string | null
}

export const sentEmailsKey = (userId: string | undefined) =>
  ['admin', 'sent-emails', userId] as const

export const sentEmailsRefreshInterval = 10_000

export async function loadSentEmails(): Promise<SentEmail[]> {
  const [grading, attendance] = await Promise.all([
    supabase.from('grading_email_sends')
      .select('id,grading_event_id,event_name,status,recipient_count,created_at,error')
      .order('created_at', { ascending: false }),
    supabase.from('admin_attendance_email_sends')
      .select('id,student_id,status,created_at,error,students(first_name,last_name)')
      .order('created_at', { ascending: false }).limit(100),
  ])
  if (grading.error || attendance.error) throw new Error('Sent emails could not be loaded. Check your connection and try again.')
  const gradingRows = ((grading.data ?? []) as GradingSend[]).map((send): SentEmail => ({
    id: `grading-${send.id}`, date: send.created_at, type: 'grading', status: send.status, error: send.error,
    sentTo: `${send.event_name ?? 'A former grading'} · ${send.recipient_count} ${send.recipient_count === 1 ? 'student' : 'students'}`,
  }))
  const attendanceRows = ((attendance.data ?? []) as AttendanceSend[]).map((send): SentEmail => {
    const student = Array.isArray(send.students) ? send.students[0] : send.students
    return { id: `attendance-${send.id}`, date: send.created_at, type: 'attendance', status: send.status, error: send.error,
      sentTo: student ? `${student.first_name} ${student.last_name}` : 'A former student' }
  })
  return [...gradingRows, ...attendanceRows].sort((left, right) => right.date.localeCompare(left.date))
}
