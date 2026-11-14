import { supabase } from '@/lib/supabase'
import { panelSelect, toPanel } from './grading-panels'

export interface ScheduleEvent {
  name: string
  starts_at: string | null
  ends_at: string | null
  centres: { name: string; address: string } | { name: string; address: string }[]
}

export interface Schedule {
  event_id: string
  track: 'adult' | 'children'
  grading_date: string
  application_opens_on: string
  application_deadline: string
  reporting_release_on: string
  reporting_time: string | null
  events: ScheduleEvent | ScheduleEvent[]
  grading_panel_members: Parameters<typeof toPanel>[0]
  grading_applications: { status: string }[]
  grading_sessions: { id: string; ends_at: string | null }[]
}

export const gradingScheduleKey = (userId: string | undefined, today: string) =>
  ['admin', 'grading-schedule', userId, today] as const

export const gradingScheduleAccountKey = (userId: string | undefined) =>
  ['admin', 'grading-schedule', userId] as const

const scheduleSelect = `event_id,track,grading_date,application_opens_on,application_deadline,reporting_release_on,reporting_time,
  events!inner(name,starts_at,ends_at,centres(name,address)),${panelSelect},grading_applications(status),grading_sessions(id,ends_at)`

export async function loadGradingSchedule(today: string): Promise<{ upcoming: Schedule[]; past: Schedule[] }> {
  const official = () => supabase.from('gradings').select(scheduleSelect).eq('official_schedule', true)
  const [next, previous] = await Promise.all([
    official().gte('grading_date', today).order('grading_date'),
    official().lt('grading_date', today).order('grading_date', { ascending: false }).limit(20),
  ])
  if (next.error || previous.error) throw new Error('Unable to load the official grading schedule.')
  return { upcoming: (next.data ?? []) as Schedule[], past: (previous.data ?? []) as Schedule[] }
}
