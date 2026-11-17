# Membership fees and renewals

Membership fees buy membership time. They never add class credits, and they are
never discounted by membership type.

## Catalogue

The browser sends only a fee id. Prices and durations are resolved on the server in
`supabase/functions/_shared/membership-fees.ts`:

| Fee id       | Price  | Extends by |
| ------------ | ------ | ---------- |
| `reg-fee`    | $60.00 | 12 months  |
| `renew-1y`   | $48.00 | 12 months  |
| `renew-5y`   | $240.00 | 60 months |
| `renew-10y`  | $480.00 | 120 months |

## Flow

1. `StudentCredits.tsx` sends `{ feeId }` to `create-membership-checkout` with a UUID
   `Idempotency-Key`.
2. The function authenticates the student, looks up their `students` row, resolves the
   fee server-side, and creates a Stripe Checkout session with metadata
   `membership_fee`, `membership_fee_id`, `membership_fee_months` and
   `membership_fee_student_id`. It also writes a pending `payments` row so an
   abandoned attempt can be cleaned up.
3. Stripe returns to `/student/credits?membership=success` (or `cancel`).
4. The signature-verified `stripe-webhook` re-reads the session from Stripe, checks the
   server price, paid amount, currency and metadata, then calls
   `finalize_membership_fee`.
5. `finalize_membership_fee` marks the payment row paid and sets
   `students.membership_expires_on` to `max(today, current expiry) + months`, so an
   early renewal keeps the time already paid for. An already-paid `stripe_session_id`
   returns early, so a webhook replay cannot extend the membership twice.

## Registration checkout

The membership application checkout (`create-checkout-session`) also sells the $60
registration fee, optionally with a $2 NFC key fob. Its webhook branch calls
`finalize_membership_checkout`, which now delegates to `finalize_membership_fee`
(12 months) and then flags `key_fob_status = 'ordered'` when a fob was bought.

## Where students see it

`My passes` on the Credits page shows the membership status, expiry date, days left,
member number, join date, and the latest paid membership fee from `payments`.
