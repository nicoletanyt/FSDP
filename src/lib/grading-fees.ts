// Base fees and S$22 late charge transcribed from the grading SOP supplied by
// the user (not a claim that the current website publishes these prices).
// The website confirms a two-week deadline and an additional late admin charge:
// https://aikidoshinjukai.com.sg/grading-information/
export type GradingTrack = 'adult' | 'children'
export type GradingPaymentMethod = 'card' | 'paynow' | 'bank_transfer'

export const LATE_GRADING_FEE = 22
export const GRADING_INFORMATION_URL = 'https://aikidoshinjukai.com.sg/grading-information/'
export const paymentMethodLabels: Record<GradingPaymentMethod, string> = {
  card: 'Credit / debit card',
  paynow: 'PayNow',
  bank_transfer: 'Bank transfer',
}

export const gradingFees = [
  { id: '12-kyu', label: '12th Kyu · Red', fee: 45, childrenOnly: true },
  { id: '11-kyu', label: '11th Kyu · Red-Gold', fee: 45, childrenOnly: true },
  { id: '10-kyu', label: '10th Kyu · Yellow', fee: 45, childrenOnly: true },
  { id: '9-kyu', label: '9th Kyu · Orange', fee: 45, childrenOnly: true },
  { id: '8-kyu', label: '8th Kyu · Green', fee: 45, childrenOnly: true },
  { id: '7-kyu', label: '7th Kyu · Purple', fee: 45, childrenOnly: true },
  { id: '6-kyu', label: '6th Kyu · Blue', fee: 50 },
  { id: '6-kyu-silver', label: '6th Kyu · Blue-Silver', fee: 50, childrenOnly: true },
  { id: '5-kyu', label: '5th Kyu · Blue-Gold', fee: 55 },
  { id: '4-kyu', label: '4th Kyu · Brown', fee: 60 },
  { id: '4-kyu-silver', label: '4th Kyu · Brown-Silver', fee: 60, childrenOnly: true },
  { id: '3-kyu', label: '3rd Kyu · Brown-Gold', fee: 65 },
  { id: '2-kyu', label: '2nd Kyu · Black', fee: 90 },
  { id: '2-kyu-silver', label: '2nd Kyu · Black-Silver', fee: 90, childrenOnly: true },
  { id: '1-kyu', label: '1st Kyu · Black-Gold', fee: 95 },
  { id: 'junior-dan', label: 'Junior Dan', fee: 215 },
  { id: '1-dan', label: '1st Dan · ShoDan', fee: 535 },
  { id: '2-dan', label: '2nd Dan · NiDan', fee: 590 },
  { id: '3-dan', label: '3rd Dan · SanDan', fee: 695 },
  { id: '4-dan', label: '4th Dan · YonDan', fee: 910 },
] as const

export function feesForTrack(track: GradingTrack) {
  return gradingFees.filter((grade) => track === 'children' || !('childrenOnly' in grade && grade.childrenOnly))
}

export function gradingFeeFor(gradeId: string) {
  return gradingFees.find((grade) => grade.id === gradeId) ?? null
}

/** Accept legacy display labels, but never guess a fee for an unknown rank. */
export function resolveGradingGradeId(value: string) {
  if (gradingFeeFor(value)) return value
  if (/junior\s*dan/i.test(value)) return 'junior-dan'
  const match = /(\d+)(?:st|nd|rd|th)?\s*(kyu|dan)/i.exec(value)
  if (!match) return null
  const silver = /silver/i.test(value) && match[2].toLowerCase() === 'kyu' ? '-silver' : ''
  const id = `${Number(match[1])}-${match[2].toLowerCase()}${silver}`
  return gradingFeeFor(id) ? id : null
}

export function singaporeDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function calculateGradingFee(gradeId: string, deadline?: string, now = new Date()) {
  const grade = gradingFeeFor(gradeId)
  if (!grade) return null
  // Submission is on time throughout the closing date in Singapore.
  const late = Boolean(deadline && isDateOnly(deadline) && singaporeDate(now) > deadline)
  const lateFee = late ? LATE_GRADING_FEE : 0
  return { baseFee: grade.fee, lateFee, total: grade.fee + lateFee, late }
}
