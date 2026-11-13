// Kept in sync with the production credit webhook when merging grading changes.
export type CreditMembershipType = 'adult' | 'junior' | 'student' | 'senior'
type CreditPass = { id: string; title: string; priceCents: number; credits: number; unlimited: boolean; audience: 'adult' | 'junior' }
const CREDIT_PASSES: CreditPass[] = [
  { id: 'adult-10', title: '10 Session Pass', priceCents: 27000, credits: 10, unlimited: false, audience: 'adult' },
  { id: 'adult-25', title: '25 Session Pass', priceCents: 60000, credits: 25, unlimited: false, audience: 'adult' },
  { id: 'adult-50', title: '50 Session Pass', priceCents: 98000, credits: 50, unlimited: false, audience: 'adult' },
  { id: 'adult-1y', title: '1 Year Unlimited Pass', priceCents: 224640, credits: 9999, unlimited: true, audience: 'adult' },
  { id: 'adult-12w', title: "12 Weeks' Unlimited Pass", priceCents: 9600, credits: 9999, unlimited: true, audience: 'adult' },
  { id: 'adult-3m', title: "3 Months' Unlimited Pass", priceCents: 57600, credits: 9999, unlimited: true, audience: 'adult' },
  { id: 'junior-1m', title: '1 Month Pass', priceCents: 15000, credits: 4, unlimited: false, audience: 'junior' },
  { id: 'junior-6m-24', title: '6 Months Pass (24 Sessions)', priceCents: 83400, credits: 24, unlimited: false, audience: 'junior' },
  { id: 'junior-6m-50', title: '6 Months Pass (50 Sessions)', priceCents: 120000, credits: 50, unlimited: false, audience: 'junior' },
]
export function resolveCreditPass(passId: unknown, membershipType: unknown) {
  const type: CreditMembershipType = membershipType === 'junior' || membershipType === 'student' || membershipType === 'senior' ? membershipType : 'adult'
  const pass = CREDIT_PASSES.find((item) => item.id === passId && item.audience === (type === 'junior' ? 'junior' : 'adult'))
  return pass ? { ...pass, amountCents: type === 'student' ? Math.round(pass.priceCents * 0.5) : pass.priceCents, membershipType: type } : null
}
