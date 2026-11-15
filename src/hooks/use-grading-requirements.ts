import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

export type Track = 'adult' | 'children'

export type Requirement = {
  id: string
  label: string
  detail: string
  met: boolean
}

export type SyllabusCategory = {
  category: string
  items: { id: string; label: string; note: string | null; signedOff: boolean }[]
}

export type GradingRequirements = {
  currentGrade: string
  nextGrade: { id: string; label: string } | null // null: highest grade on this track
  track: Track
  requirements: Requirement[]
  syllabus: SyllabusCategory[]
  eligible: boolean
}

// Mirrors public.eligible_grading_students so the page agrees with the server.
const MIN_MONTHS_AS_MEMBER = 3

function singaporeToday() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
}

function monthsBetween(fromIso: string, to: Date) {
  const from = new Date(`${fromIso}T00:00:00`)
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(months, 0)
}

function addMonths(iso: string, months: number) {
  const date = new Date(`${iso}T00:00:00`)
  date.setMonth(date.getMonth() + months)
  return date
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type StudentRow = {
  id: string
  current_grade_id: string
  date_of_birth: string
  joined_at: string
  last_graded_at: string | null
  outstanding_fees: boolean
  membership_status: string
  grade: { label: string; sort_order: number } | { label: string; sort_order: number }[] | null
}

async function loadRequirements(userId: string): Promise<GradingRequirements | null> {
  const { data: student, error } = await supabase
    .from('students')
    .select(`id, current_grade_id, date_of_birth, joined_at, last_graded_at, outstanding_fees, membership_status,
      grade:grades!students_current_grade_id_fkey(label, sort_order)`)
    .eq('user_id', userId)
    .maybeSingle<StudentRow>()
  if (error) throw error
  if (!student) return null

  const current = Array.isArray(student.grade) ? student.grade[0] : student.grade
  const today = singaporeToday()
  // Same calendar-year age rule as the server: 13+ grades on the adult track.
  const age = today.getFullYear() - Number(student.date_of_birth.slice(0, 4))
  const track: Track = age >= 13 ? 'adult' : 'children'

  const { data: nextRows, error: nextError } = await supabase
    .from('grades')
    .select('id, label, sort_order, grade_tracks!inner(track)')
    .eq('grade_tracks.track', track)
    .gt('sort_order', current?.sort_order ?? -1)
    .order('sort_order')
    .limit(1)
  if (nextError) throw nextError
  const next = nextRows?.[0] ?? null

  if (!next) {
    return {
      currentGrade: current?.label ?? 'Unranked', nextGrade: null, track,
      requirements: [], syllabus: [], eligible: false,
    }
  }

  const since = student.last_graded_at ?? student.joined_at
  const [requirementRow, attendance, syllabusRows, signOffs] = await Promise.all([
    supabase.from('grade_requirements')
      .select('min_months, min_sessions, min_age_years')
      .eq('grade_id', next.id).eq('track', track).maybeSingle(),
    supabase.from('event_students')
      .select('event_id, events!inner(event_type, starts_at)', { count: 'exact', head: true })
      .eq('student_id', student.id)
      .in('attendance_status', ['present', 'late'])
      .eq('events.event_type', 'class')
      .gte('events.starts_at', since),
    supabase.from('syllabus_items')
      .select('id, category, label, note, sort_order')
      .eq('grade_id', next.id).eq('track', track)
      .order('sort_order'),
    supabase.from('technique_sign_offs').select('syllabus_item_id').eq('student_id', student.id),
  ])
  for (const result of [requirementRow, attendance, syllabusRows, signOffs]) {
    if (result.error) throw result.error
  }

  const rule = requirementRow.data ?? { min_months: 0, min_sessions: null, min_age_years: null }
  const sessions = attendance.count ?? 0
  const signed = new Set((signOffs.data ?? []).map((row) => row.syllabus_item_id as string))

  const requirements: Requirement[] = []

  const memberMonths = monthsBetween(student.joined_at, today)
  requirements.push({
    id: 'membership',
    label: 'Active membership for 3+ months',
    detail: student.membership_status !== 'active'
      ? 'Your membership is not active.'
      : `Member for ${plural(memberMonths, 'month')}.`,
    met: student.membership_status === 'active' && memberMonths >= MIN_MONTHS_AS_MEMBER,
  })

  if (rule.min_months > 0) {
    const ready = student.last_graded_at ? addMonths(student.last_graded_at, rule.min_months) : null
    requirements.push({
      id: 'time-in-rank',
      label: `${plural(rule.min_months, 'month')} since your last grading`,
      detail: student.last_graded_at
        ? `${plural(monthsBetween(student.last_graded_at, today), 'month')} so far${
          ready && ready > today ? `; eligible from ${ready.toLocaleDateString('en-SG', { dateStyle: 'medium' })}` : ''}.`
        : 'No previous grading on record. Ask your instructor to confirm your current grade.',
      met: !!ready && ready <= today,
    })
  }

  if (rule.min_sessions != null) {
    requirements.push({
      id: 'sessions',
      label: `${plural(rule.min_sessions, 'class')} attended since your last grading`,
      detail: `${sessions} of ${rule.min_sessions} attended.`,
      met: sessions >= rule.min_sessions,
    })
  }

  if (rule.min_age_years != null) {
    requirements.push({
      id: 'age',
      label: `At least ${rule.min_age_years} years old this year`,
      detail: `You turn ${age} this year.`,
      met: age >= rule.min_age_years,
    })
  }

  requirements.push({
    id: 'fees',
    label: 'No outstanding fees',
    detail: student.outstanding_fees ? 'You have outstanding fees. Please settle them at your dojo.' : 'All fees are settled.',
    met: !student.outstanding_fees,
  })

  const categories = new Map<string, SyllabusCategory>()
  for (const item of syllabusRows.data ?? []) {
    const entry: SyllabusCategory = categories.get(item.category) ?? { category: item.category, items: [] }
    entry.items.push({ id: item.id, label: item.label, note: item.note, signedOff: signed.has(item.id) })
    categories.set(item.category, entry)
  }
  const syllabus = [...categories.values()]
  const allSignedOff = syllabus.every((group) => group.items.every((item) => item.signedOff))

  return {
    currentGrade: current?.label ?? 'Unranked',
    nextGrade: { id: next.id, label: next.label },
    track,
    requirements,
    syllabus,
    eligible: allSignedOff && requirements.every((r) => r.met),
  }
}

/** What the signed-in student still needs before they can apply for their next grading. */
export function useGradingRequirements() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [result, setResult] = useState<{ userId: string; data: GradingRequirements | null; error: boolean } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadRequirements(userId)
      .then((data) => !cancelled && setResult({ userId, data, error: false }))
      .catch((failure) => {
        console.error('Could not load grading requirements:', failure)
        if (!cancelled) setResult({ userId, data: null, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const current = result?.userId === userId ? result : null
  return { data: current?.data ?? null, loading: !!userId && !current, error: current?.error ?? false }
}
