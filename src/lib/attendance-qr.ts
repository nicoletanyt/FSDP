import { supabase } from '@/lib/supabase'

/** What public.student_attendance_qr() reports for the signed-in student right now. */
export type AttendanceQr =
  | { status: 'unavailable' | 'none' }
  | { status: 'upcoming'; className: string; startsAt: string; opensAt: string }
  | { status: 'checked_in'; className: string; startsAt: string }
  | {
      status: 'ready'
      className: string
      startsAt: string
      payload: string
      /** Milliseconds from now until the code rotates, corrected for clock skew. */
      refreshInMs: number
    }

type Row = Record<string, unknown>
const str = (value: unknown) => (typeof value === 'string' ? value : '')

export function parseAttendanceQr(value: unknown): AttendanceQr {
  const row = (value && typeof value === 'object' ? value : {}) as Row
  const className = str(row.class_name) || 'Class'
  switch (row.status) {
    case 'upcoming':
      return { status: 'upcoming', className, startsAt: str(row.starts_at), opensAt: str(row.opens_at) }
    case 'checked_in':
      return { status: 'checked_in', className, startsAt: str(row.starts_at) }
    case 'ready': {
      const payload = str(row.payload)
      if (!payload) return { status: 'unavailable' }
      // Measure against the server's clock so a wrong phone clock can't break the timer.
      const refreshInMs = Date.parse(str(row.refresh_at)) - Date.parse(str(row.server_now))
      return {
        status: 'ready',
        className,
        startsAt: str(row.starts_at),
        payload,
        refreshInMs: Number.isFinite(refreshInMs) ? Math.min(Math.max(refreshInMs, 1_000), 60_000) : 60_000,
      }
    }
    case 'none':
      return { status: 'none' }
    default:
      return { status: 'unavailable' }
  }
}

export async function fetchAttendanceQr(): Promise<AttendanceQr> {
  const { data, error } = await supabase.rpc('student_attendance_qr')
  if (error) throw error
  return parseAttendanceQr(data)
}
