# Credit batches: implementation and rollout

## Complete source files

- SQL: `supabase/migrations/20261115064757_add_credit_batches.sql`
- Payment screen: `src/pages/Student/StudentCredits.tsx`
- Balance card (actual existing path): `src/pages/Student/CreditBalanceCard.tsx`
- Class screen (actual existing path): `src/pages/StudentClasses.tsx`
- Verified credit grant: `supabase/functions/stripe-webhook/handler.ts`
- Balance reads/refresh: `src/lib/student-credits.ts`, `src/hooks/use-student-credits.ts`
- Shared context and writes: `src/layouts/StudentLayout.tsx`, `src/lib/use-live-student-schedule.ts`

These files contain the complete implementation, not replacement UI mockups.
The existing card and booking layouts are retained; the balance card gains a red
expiration warning with an icon and readable text, verified at 320/1440px.

## Security corrections to the proposed client-side flow

There is no `handleProcessPayment` callback in this repository: purchases open
Stripe-hosted Checkout and return to the dashboard. A return URL is NOT proof of
payment. Only the signature-verified webhook, after checking the paid Stripe
session, can call the service-only `finalize_credit_checkout` RPC. The same
transaction records the purchase, one uniquely-linked batch, payment history and
the reconciled account total. Duplicate Stripe session deliveries cannot grant
credits twice. Signed Stripe event time determines validity, not the browser or
webhook retry's clock. The old nine-argument server call remains supported.

RLS allows authenticated users to SELECT only batches whose `user_id` matches
`auth.uid()`. Users cannot INSERT/UPDATE/DELETE even their own financial batches:
otherwise they could add free credits or extend expiration. Authorized booking
RPCs perform precisely scoped changes instead. Private catalogue and booking
allocation tables have no browser table grants. Anonymous callers cannot invoke
summary, booking or finalization functions. The old booking function is renamed
to `change_booking_core` with browser EXECUTE revoked, so it cannot bypass billing.

## Validity catalogue

| Pass | Finite credits | Validity |
| --- | ---: | --- |
| adult-10 | 10 | 11 weeks |
| adult-25 | 25 | 4 calendar months |
| adult-50 | 50 | 6 calendar months |
| junior-1m | 4 | 5 weeks |
| junior-6m-24 | 24 | 6 calendar months |
| junior-6m-50 | 50 | 6 calendar months |
| adult-1y | unlimited | 12 calendar months |
| adult-12w | unlimited | 12 weeks |
| adult-3m | unlimited | 3 calendar months |

Months use Singapore calendar arithmetic, not 30-day approximations. An
entitlement is valid while `expires_at > now()`. `unlimited` is an explicit flag,
not 9,999 consumable credits. Finite credits are preserved even while an unlimited
pass is active. Unlimited eligibility ends when its last active batch expires.

**Existing billing limitations are not silently changed:** the Stripe webhook
still rejects live-mode events. The existing `adult-12w` offering advertises six
instalments but currently uses one-time Checkout, not an actual subscription.
This change implements batch validity, NOT recurring collection, live payments,
cash refunds, chargeback revocation or installment default handling. Do not claim
those workflows are commercially complete or launch that installment product
until subscription billing and its failure/revocation rules are implemented.

## Old balances and existing bookings

The aggregate balance does not reveal which past purchases remain unspent or
when they should expire. At migration time it is preserved **once** in labelled
`source = 'legacy'` batches with `expires_at = 'infinity'`. Existing unlimited
accounts receive an explicit legacy unlimited batch. This is a transparent
cutover policy, not an invented expiry date. Review/allocate those historical
balances with the business before launch if they must have finite validity.
Old purchase receipts are not backfilled into additional credits, and webhook
retries for them remain no-ops. The migration does not retroactively charge
existing class bookings; cancellations of those bookings cannot mint refunds.

## Booking rules

Enrollment, batch charge, audit entry and aggregate balance commit or roll back
together. The member/account rows serialize requests for the same user. Existing
event locks and membership/capacity/overlap/check-in rules are retained.

1. Prefer an active unlimited entitlement (no finite debit).
2. Otherwise choose a positive, unexpired batch ordered by
   `(expires_at, created_at, id)` and decrement exactly one credit. This is FEFO
   (first expiry first) with deterministic FIFO tie-breaks.
3. If no eligible batch exists, fail and roll back the class seat.
4. Recompute the account's spendable total from valid batches, rather than
   trusting a stale aggregate. Browser-only `deductCredit` simulation is removed.

Cancellation restores a charged credit to its **original** batch. An expired
batch stays expired: cancellation cannot extend validity. Unlimited and historical
uncharged bookings have no finite refund. Debit/refund transactions are retained
in `credit_batch_transactions`; private allocations track each current booking.
Rescheduling transfers the existing prepaid allocation without an extra debit or
refund, including when the original allocation's pass has since expired. This
preserves the prepaid reservation; it is an explicit policy, not an expiry reset.
Waitlist joins/leaves never consume credits. Multi-selection keeps the existing
per-session success/failure behavior, not a new all-or-nothing cart transaction.

Direct trusted administrator/instructor roster edits remain administrative
operations and do not automatically bill students. Use the booking RPC for
chargeable student self-service changes. A multi-class cart, persistent request
receipts, payment-refund/chargeback automation and reconciliation alerts would be
separate workflows.

## Balance and warnings

The Credits page now includes **My passes & expiry**, linked from the dashboard
balance card through **View my passes & expiry** (`/student/credits#my-passes`).
It loads the caller's actual `credit_batches` with `credits_remaining > 0`, each
in its own card, sorted strictly by expiration ascending (unknown/infinite last).
Cards show the saved purchase title, purchase time, remaining/total credits, exact
Singapore-time expiration, remaining days and Active/Expiring soon/Expired states.
Less than 21 days remaining adds an explicit red warning. Exhausted batches and
unlimited entitlements with zero finite points are excluded from this point-batch
list; unlimited eligibility remains part of the dashboard balance calculation.
Carried-over infinite/null legacy balances show **No expiry recorded** and
**Carried over on**, not an invented original purchase date. One legacy aggregate
cannot be split into historical purchases without reliable allocation records.
Long lists have a show-all control.
This UI addition needs no further SQL migration after the batches migration.

`my_credit_summary()` derives totals from valid batches, synchronizes
`credit_accounts` under its row lock, and returns the earliest positive finite
expiry within 21 days. Batches sharing that timestamp are summed. Expired or
depleted batches and legacy infinite expirations do not show a warning. An active
unlimited account may still see a warning for its finite credits, as they continue
to expire independently.

The existing credit hook refreshes on entry, every minute and window focus, and
polls faster for pending checkout confirmation. Booking attempts trigger a reload
even after ambiguous errors. Payment success is never inferred from the URL.

Time passing cannot itself update a physical SQL row. These RPCs reconcile the
aggregate lazily; the batch-derived summary is authoritative. For offline report
caches, schedule `select credit_private.reconcile_accounts();` in Supabase Cron
(for example every minute). Its EXECUTE privilege is service-only; browser users
cannot call it. No Cron extension/job is installed by this migration.

## Deployment (not performed by the coding agent)

1. Back up/review the target project's data and legacy-balance policy first.
2. Apply the **entire** `20261115064757_add_credit_batches.sql` once, through your
   normal migration deployment or SQL Editor. It requires the existing domain,
   membership/payment, credit checkout and booking migrations. This is a versioned
   one-time migration: do not rerun it manually after it succeeds.
3. Deploy the updated Stripe webhook and frontend together. Current CLI example:

   ```powershell
   npx supabase functions deploy stripe-webhook --remote=YOUR_PROJECT_REF --use-api
   ```

4. Optionally configure the service-only Cron reconciliation above for reports.
5. Complete a new Stripe test purchase; check one receipt/batch and no duplicate
   grant on replay. Enroll, cancel and reschedule classes with your test account.

SQL Editor verification (replace with your test account's Auth UUID):

```sql
select id, source, credits_total, credits_remaining, unlimited, expires_at,
       stripe_session_id
from public.credit_batches
where user_id = 'YOUR_AUTH_USER_UUID'
order by expires_at, created_at, id;

select a.credits as cached_total,
       coalesce(sum(b.credits_remaining) filter (
         where not b.unlimited and b.expires_at > now()
       ), 0) as valid_batch_total
from public.credit_accounts a
left join public.credit_batches b on b.user_id = a.user_id
where a.user_id = 'YOUR_AUTH_USER_UUID'
group by a.user_id, a.credits;
```

Do not run `my_credit_summary()` in SQL Editor expecting browser identity:
SQL Editor does not automatically have your student's JWT. Use the logged-in app
or the explicit account-filtered administrative queries above.

## Verification

Offline PGlite tests load the real schema/migrations and verify finite validity,
calendar months, unlimited expiry, duplicate receipts, ownership, browser write
denial, expired/depleted exclusion, FEFO order, refunds and rollback of failed
enrollments. They are not a substitute for a load test with multiple connections
on the hosted PostgreSQL server.

```powershell
node --test tests/credit-batches-db.test.mjs tests/student-credits.test.mjs tests/credit-checkout-db.test.mjs tests/student-class-booking.test.mjs tests/student-payments.test.mjs
npx deno test --no-config --no-lock --node-modules-dir=none --allow-env supabase/functions/tests/credit-checkout.test.ts supabase/functions/tests/membership-webhook.test.ts
```

Chrome fixture: run Vite and
`node --test tests/mobile-responsive/student-credits.test.mjs`. The fixture never
charges a card or contacts Supabase; it checks 320/1440px layout, payment waiting,
error/retry, unlimited balance and expiration warning boundaries.
