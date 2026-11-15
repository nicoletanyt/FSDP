import { adminClient } from './grading.ts'
import { sendStudentEmail, type StudentMessage } from './student-emailjs.ts'

export type CreditPurchase = {
  stripe_session_id: string
  user_id: string
  pass_title: string
  credits: number
  unlimited: boolean
  amount_cents: number
  currency: string
  created_at: string
}
export type Recipient = { email: string; first_name: string | null; last_name: string | null }
export type Balance = { credits: number; unlimited: boolean }

export type ReceiptDependencies = {
  loadPurchase: (sessionId: string) => Promise<CreditPurchase | null>
  loadRecipient: (userId: string) => Promise<Recipient | null>
  loadBalance: (userId: string) => Promise<Balance | null>
  send: (message: StudentMessage, key: string) => Promise<string>
}

const defaults: ReceiptDependencies = {
  async loadPurchase(sessionId) {
    const { data, error } = await adminClient().from('credit_purchases')
      .select('stripe_session_id, user_id, pass_title, credits, unlimited, amount_cents, currency, created_at')
      .eq('stripe_session_id', sessionId).maybeSingle<CreditPurchase>()
    if (error) throw new Error('Credit purchase lookup failed.')
    return data
  },
  async loadRecipient(userId) {
    const { data, error } = await adminClient().from('users')
      .select('email, first_name, last_name').eq('id', userId).maybeSingle<Recipient>()
    if (error) throw new Error('Recipient lookup failed.')
    return data
  },
  async loadBalance(userId) {
    const { data, error } = await adminClient().from('credit_accounts')
      .select('credits, unlimited').eq('user_id', userId).maybeSingle<Balance>()
    if (error) throw new Error('Credit balance lookup failed.')
    return data
  },
  send: sendStudentEmail,
}

const receiptDate = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
})

export function creditReceiptMessage(recipient: Recipient, purchase: CreditPurchase, balance: Balance | null): StudentMessage {
  const name = [recipient.first_name, recipient.last_name].filter(Boolean).join(' ') || 'there'
  const amount = `${purchase.currency.toUpperCase() === 'SGD' ? 'S$' : `${purchase.currency.toUpperCase()} `}${(purchase.amount_cents / 100).toFixed(2)}`
  const rows: [string, string][] = [
    ['Class pass', purchase.pass_title],
    ['Credits added', purchase.unlimited ? 'Unlimited' : String(purchase.credits)],
    ['Amount paid', amount],
    ['Date', receiptDate.format(new Date(purchase.created_at))],
    ['Payment reference', purchase.stripe_session_id.slice(-12).toUpperCase()],
    ['Your balance now', !balance ? 'Not available' : balance.unlimited ? 'Unlimited' : `${balance.credits} credit${balance.credits === 1 ? '' : 's'}`],
  ]
  return {
    to: recipient.email,
    subject: `Receipt: ${purchase.pass_title}`,
    text: `Dear ${name},\n\nYour payment was successful and your class credits have been added to your account.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nYou can see this purchase any time under Payments in your student portal.\n\nAikido Shinju-Kai`,
  }
}

/** Called only after the Stripe webhook verifies and finalizes this credit purchase. */
export async function sendCreditReceipt(sessionId: string, dependencies: ReceiptDependencies = defaults) {
  const purchase = await dependencies.loadPurchase(sessionId)
  if (!purchase) throw new Error('Credit purchase not found.')
  const recipient = await dependencies.loadRecipient(purchase.user_id)
  if (!recipient?.email) throw new Error('Purchaser has no email address.')
  const balance = await dependencies.loadBalance(purchase.user_id)
  return dependencies.send(creditReceiptMessage(recipient, purchase, balance), `credit-receipt/${purchase.stripe_session_id}/v1`)
}
