import { supabase } from '@/lib/supabase'

export type GradingCheckoutOption = {
  id: string
  name: string
  grading_date: string
  application_deadline: string
  centre_name: string
  venue_address: string
  target_grade: string
  grade_label: string
  applied: boolean
  base_amount: number
  late_amount: number
  total_amount: number
}

export type GradingQuote = {
  eventId: string
  targetGradeId: string
  gradeLabel: string
  baseFeeCents: number
  lateFeeCents: number
  totalCents: number
  applicationDeadline: string
}

export async function gradingCheckoutRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('create-grading-checkout', { body })
  if (error) {
    if (error.context instanceof Response) {
      const detail = await error.context.clone().json().catch(() => null)
      if (typeof detail?.error === 'string') throw new Error(detail.error)
    }
    throw new Error(error.message || 'Unable to contact Stripe checkout.')
  }
  if (!data) throw new Error('No checkout response was received.')
  return data
}

export async function getGradingQuote(eventId: string, gradeId: string) {
  const { quote } = await gradingCheckoutRequest<{ quote: GradingQuote }>({
    action: 'quote', event_id: eventId, target_grade_id: gradeId,
  })
  if (!quote || !Number.isInteger(quote.totalCents) || quote.totalCents <= 0 ||
    quote.baseFeeCents + quote.lateFeeCents !== quote.totalCents ||
    quote.eventId !== eventId || quote.targetGradeId !== gradeId) throw new Error('Invalid grading fee quote.')
  return quote
}

export async function getGradingCheckoutUrl(quote: GradingQuote) {
  const { url } = await gradingCheckoutRequest<{ url: string }>({
    action: 'checkout', event_id: quote.eventId,
    target_grade_id: quote.targetGradeId, expected_amount: quote.totalCents,
  })
  if (typeof url !== 'string' || new URL(url).origin !== 'https://checkout.stripe.com') {
    throw new Error('Stripe did not return a valid Checkout URL.')
  }
  return url
}

export async function getGradingTestCheckoutUrl(targetGradeId: string, expectedAmount: number, requestId: string) {
  const { url } = await gradingCheckoutRequest<{ url: string }>({
    action: 'test-checkout', target_grade_id: targetGradeId,
    expected_amount: expectedAmount, request_id: requestId,
  })
  if (typeof url !== 'string' || new URL(url).origin !== 'https://checkout.stripe.com') {
    throw new Error('Stripe did not return a valid Checkout URL.')
  }
  return url
}
