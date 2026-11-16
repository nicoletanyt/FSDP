export type MembershipFee = {
  id: string
  title: string
  priceCents: number
  /** How many months of membership this fee buys. */
  months: number
}

// Server-side catalogue. The browser only sends a fee id; the amount and the
// number of months are resolved here, so a tampered request can't underpay.
export const MEMBERSHIP_FEES: MembershipFee[] = [
  {
    id: 'reg-fee',
    title: 'Registration/Material Fees 【New Enrolment】',
    priceCents: 6000,
    months: 12,
  },
  {
    id: 'renew-1y',
    title: 'Annual Membership Fees Renewal 【Existing Member】',
    priceCents: 4800,
    months: 12,
  },
  {
    id: 'renew-5y',
    title: '5 Years Annual Membership Fees Renewal 【Existing Members】',
    priceCents: 24000,
    months: 60,
  },
  {
    id: 'renew-10y',
    title: '10 Years Annual Membership Fees Renewal 【Existing Members】',
    priceCents: 48000,
    months: 120,
  },
]

export function resolveMembershipFee(id: unknown): MembershipFee | null {
  if (typeof id !== 'string') return null
  return MEMBERSHIP_FEES.find((fee) => fee.id === id) ?? null
}
