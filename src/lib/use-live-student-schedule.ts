import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClassOffering, Enrollment } from '@/lib/student-schedule'

type Session = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  status: string
  class_type_id: string
  class_type: string
  description: string | null
  centre: string
  instructor: string | null
  capacity: number | null
  occupied: number
  booked: boolean
  waitlisted: boolean
  attendance_status: 'present' | 'absent' | 'late' | 'excused' | null
  moved_from_event_id: string | null
}

type Snapshot = { grade: string | null; linked: boolean; active: boolean; sessions: Session[] }
type Action = 'enrol' | 'cancel' | 'reschedule' | 'join' | 'leave'

const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', dateStyle: 'short' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const statuses = { present: 'attended', absent: 'missed', late: 'late', excused: 'excused' } as const

export function useLiveStudentSchedule() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const { data, error } = await supabase.rpc('student_class_schedule').abortSignal(controller.signal)
        if (controller.signal.aborted) return
        if (error) throw error
        setSnapshot(data as Snapshot)
      } catch {
        if (!controller.signal.aborted) setError('Could not load your class schedule. Try again.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [revision])

  const { classes, enrollments, waitlist } = useMemo(() => {
    const classes: ClassOffering[] = []
    const enrollments: Enrollment[] = []
    const waitlist: string[] = []
    for (const session of snapshot?.sessions ?? []) {
      const starts = new Date(session.starts_at)
      const ends = new Date(session.ends_at)
      const dateId = dayFormat.format(starts)
      const startTime = timeFormat.format(starts)
      classes.push({
        id: session.id,
        templateId: JSON.stringify([session.class_type_id, session.name, session.centre, session.instructor, startTime]),
        date: new Date(`${dateId}T12:00:00`),
        dateId,
        title: session.name,
        centre: session.centre,
        instructor: session.instructor ?? 'Coach to be announced',
        startTime,
        endTime: dayFormat.format(ends) === dateId ? timeFormat.format(ends) : '24:00',
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        scheduled: session.status === 'scheduled',
        bookable: session.status === 'scheduled' && session.capacity !== null,
        classType: session.class_type,
        level: session.description ?? session.class_type,
        capacity: session.capacity ?? 0,
        occupied: session.occupied
      })
      if (session.booked) enrollments.push({
        id: session.id,
        status: session.attendance_status ? statuses[session.attendance_status]
          : session.status === 'cancelled' ? 'cancelled'
            : session.moved_from_event_id ? 'make-up' : 'enrolled',
        movedFrom: session.moved_from_event_id ?? undefined
      })
      if (session.waitlisted) waitlist.push(session.id)
    }
    return { classes, enrollments, waitlist }
  }, [snapshot])

  const isBooked = (id: string) => enrollments.some(entry => entry.id === id)
  const isWaitlisted = (id: string) => waitlist.includes(id)
  const isFull = (session: ClassOffering) => session.occupied >= session.capacity

  async function change(action: Action, targetId: string, originalId?: string): Promise<string | null> {
    if (savingRef.current) return 'A booking change is already in progress.'
    savingRef.current = true
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('change_student_class_booking', {
        action, target_id: targetId, original_id: originalId ?? null
      })
      if (error) {
        if (error.code !== 'P0001') return 'Could not update your booking. Try again.'
        const latest = await supabase.rpc('student_class_schedule')
        if (!latest.error && latest.data) setSnapshot(latest.data as Snapshot)
        return error.message
      }
      setSnapshot(data as Snapshot)
      return null
    } catch {
      return 'Could not update your booking. Try again.'
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return {
    classes, enrollments, waitlist, loading, error, saving,
    grade: snapshot?.grade,
    linked: snapshot?.linked ?? false,
    active: snapshot?.active ?? false,
    retry: () => { setLoading(true); setError(''); setRevision(previous => previous + 1) },
    isBooked, isWaitlisted, isFull,
    enroll: (session: ClassOffering) => change('enrol', session.id),
    cancel: (id: string) => change('cancel', id),
    reschedule: (id: string, replacement: ClassOffering) => change('reschedule', replacement.id, id),
    joinWaitlist: (session: ClassOffering) => change('join', session.id),
    leaveWaitlist: (id: string) => change('leave', id)
  }
}
