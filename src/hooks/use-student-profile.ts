import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import type { Payment, Profile, Standing } from '@/lib/student-profile'

const LEGACY_GRADING_FEE = 60 // SGD; attempts paid before per-grade fees were all $60

const standings: Record<string, Standing> = { active: 'Active', pending: 'Pending', expired: 'Expired' }
const paymentStatuses: Record<string, Payment['status']> = { paid: 'Paid', pending: 'Pending', refunded: 'Refunded' }

type One<T> = T | T[] | null
const one = <T,>(value: One<T>) => (Array.isArray(value) ? value[0] ?? null : value)

type StudentRow = {
  id: string
  member_no: string
  first_name: string
  last_name: string
  membership_status: string
  joined_at: string
  grade: One<{ label: string; colour: string | null }>
  centre: One<{ name: string }>
}
type PaymentRow = {
  id: string
  item: string
  description: string
  amount_cents: number
  method: string
  status: string
  created_at: string
  paid_at: string | null
}
type GradingAttemptRow = {
  id: string
  created_at: string
  amount_cents: number | null
  grade: One<{ label: string }>
}

async function loadProfile(userId: string, accountName: string): Promise<Profile> {
  const { data: student, error } = await supabase
    .from('students')
    .select(`id, member_no, first_name, last_name, membership_status, joined_at,
      grade:grades!students_current_grade_id_fkey(label, colour),
      centre:centres!students_home_centre_id_fkey(name)`)
    .eq('user_id', userId)
    .maybeSingle<StudentRow>()
  if (error) throw error

  // Signed up but never applied: show the account, nothing else to load.
  if (!student) {
    return {
      memberId: null, fullName: accountName, photoUrl: null,
      belt: { name: 'Unranked', colour: null }, homeDojo: null, memberSince: null,
      standing: 'None', payments: [],
    }
  }

  const [payments, grading] = await Promise.all([
    supabase
      .from('payments')
      .select('id, item, description, amount_cents, method, status, created_at, paid_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .returns<PaymentRow[]>(),
    supabase
      .from('grading_checkout_attempts')
      .select('id, created_at, amount_cents, grade:grades!grading_checkout_attempts_target_grade_id_fkey(label)')
      .eq('student_id', student.id)
      .eq('status', 'paid')
      .returns<GradingAttemptRow[]>(),
  ])
  if (payments.error) throw payments.error
  if (grading.error) throw grading.error

  const grade = one(student.grade)
  return {
    memberId: student.member_no,
    fullName: `${student.first_name} ${student.last_name}`.trim() || accountName,
    photoUrl: null,
    belt: { name: grade?.label ?? 'Unranked', colour: grade?.colour ?? null },
    homeDojo: one(student.centre)?.name ?? null,
    memberSince: student.joined_at,
    standing: standings[student.membership_status] ?? 'Pending',
    payments: [
      ...(payments.data ?? []).map((p): Payment => ({
        id: p.id,
        date: p.paid_at ?? p.created_at,
        item: p.item,
        description: p.description,
        method: p.method,
        amount: p.amount_cents / 100,
        status: paymentStatuses[p.status] ?? 'Pending',
      })),
      ...(grading.data ?? []).map((g): Payment => ({
        id: g.id,
        date: g.created_at,
        item: 'Grading',
        description: `Grading fee${one(g.grade) ? ` — ${one(g.grade)!.label}` : ''}`,
        method: 'Stripe',
        amount: g.amount_cents ? g.amount_cents / 100 : LEGACY_GRADING_FEE,
        status: 'Paid',
      })),
    ],
  }
}

/** The signed-in student's membership card, details and payment history. */
export function useStudentProfile() {
  const { session, profile } = useAuth()
  const userId = session?.user.id
  const accountName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email || ''
  const [result, setResult] = useState<{ userId: string; profile: Profile | null; error: boolean } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadProfile(userId, accountName)
      .then((loaded) => !cancelled && setResult({ userId, profile: loaded, error: false }))
      .catch((failure) => {
        console.error('Could not load student profile:', failure)
        if (!cancelled) setResult({ userId, profile: null, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [userId, accountName])

  const current = result?.userId === userId ? result : null
  return {
    profile: current?.profile ?? null,
    loading: !!userId && !current,
    error: current?.error ?? false,
  }
}
