export type CreditMembershipType = 'adult' | 'junior' | 'student' | 'senior'

export type CreditPass = {
  id: string
  title: string
  priceCents: number
  credits: number
  unlimited: boolean
  audience: 'adult' | 'junior'
}

export type ResolvedCreditPass = CreditPass & {
  amountCents: number
  membershipType: CreditMembershipType
}

const UNLIMITED_CREDITS = 9999
const STUDENT_DISCOUNT = 0.5

// Server-side catalogue. Client prices are never trusted; the browser only
// sends a pass id, and the amount is resolved here.
export const CREDIT_PASSES: CreditPass[] = [
  { id: 'adult-10', title: '10 Session Pass', priceCents: 27000, credits: 10, unlimited: false, audience: 'adult' },
  { id: 'adult-25', title: '25 Session Pass', priceCents: 60000, credits: 25, unlimited: false, audience: 'adult' },
  { id: 'adult-50', title: '50 Session Pass', priceCents: 98000, credits: 50, unlimited: false, audience: 'adult' },
  { id: 'adult-1y', title: '1 Year Unlimited Pass', priceCents: 224640, credits: UNLIMITED_CREDITS, unlimited: true, audience: 'adult' },
  { id: 'adult-12w', title: "12 Weeks' Unlimited Pass", priceCents: 9600, credits: UNLIMITED_CREDITS, unlimited: true, audience: 'adult' },
  { id: 'adult-3m', title: "3 Months' Unlimited Pass", priceCents: 57600, credits: UNLIMITED_CREDITS, unlimited: true, audience: 'adult' },
  { id: 'junior-1m', title: '1 Month Pass', priceCents: 15000, credits: 4, unlimited: false, audience: 'junior' },
  { id: 'junior-6m-24', title: '6 Months Pass (24 Sessions)', priceCents: 83400, credits: 24, unlimited: false, audience: 'junior' },
  { id: 'junior-6m-50', title: '6 Months Pass (50 Sessions)', priceCents: 120000, credits: 50, unlimited: false, audience: 'junior' },
]

export function isCreditMembershipType(value: unknown): value is CreditMembershipType {
  return value === 'adult' || value === 'junior' || value === 'student' || value === 'senior'
}

export function resolveCreditPass(passId: unknown, membershipType: unknown): ResolvedCreditPass | null {
  if (typeof passId !== 'string') return null
  const type: CreditMembershipType = isCreditMembershipType(membershipType) ? membershipType : 'adult'
  const audience = type === 'junior' ? 'junior' : 'adult'
  const pass = CREDIT_PASSES.find((item) => item.id === passId && item.audience === audience)
  if (!pass) return null

  return {
    ...pass,
    amountCents: type === 'student' ? Math.round(pass.priceCents * STUDENT_DISCOUNT) : pass.priceCents,
    membershipType: type,
  }
}
