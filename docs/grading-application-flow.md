# Grading application and payment flow

## Complete implementation files

- `supabase/migrations/20261116054658_grading_application_flow.sql`
- `supabase/migrations/20261116061423_grading_membership_readonly_prefill.sql`
- `supabase/functions/create-grading-checkout/handler.ts`
- `supabase/functions/stripe-webhook/handler.ts`
- `src/lib/grading-checkout.ts`
- `src/pages/Student/StudentGrading.tsx`

These are complete files, not pseudocode. Apply both migrations in timestamp order before deploying
the two updated Edge Functions, then release the frontend. Existing migrations,
including `20261114142809_membership_application_submit.sql` and
`20261115062900_student_profile_editing.sql`, must already be applied.
No hosted database or deployed Edge Function has been changed by this work.

## Dates and statuses

The existing `gradings` / `events` official schedule is authoritative:

| Track | Published 2026 dates |
| --- | --- |
| Adult | March 8, June 21, September 13, December 13 |
| Children | April 12, August 16, December 6 |

The dropdown shows upcoming scheduled official events for the student's
calendar-year age group. Past events are not selectable. Selecting a date does
not confer eligibility: checkout still revalidates membership, training,
application windows and the database-controlled next grade and fee.

`grading_applications.status = 'under_review'` is the existing enum's equivalent
of **pending_review**. Reusing it preserves administrator/instructor consumers.
The UI displays **Payment confirmed** and explains that dojo review is pending.
The legacy test-preview tables are separate from formal event applications;
the new form never starts a preview checkout to bypass eligibility.

## Ownership and payment integrity

- Names, phone and emergency contacts are prefilled from the submitted Membership
  form in `membership_private.application_details`, falling back to `students`
  and `emergency_contacts` for older accounts or missing snapshot values.
- Medical details include the Membership form's `medicalDetails` and active
  medical records, with duplicate notes removed. All profile fields are always
  read-only on the grading page; only the grading date can be selected.
- Profile reads are scoped to `auth.uid()` and checked against the live student
  role. The RPC returns only a grading-specific allowlist, never NRIC, guardian,
  address or the full private form JSON. The former grading profile save RPC is
  revoked from browser roles; profile editing elsewhere is unchanged.
- Missing saved contact details are explained and block payment. The page does
  not fabricate values or ask the student to fill the Membership form again.
- Checkout snapshots the database grading date, binds it into Stripe metadata,
  and validates the date selected by the browser against that snapshot.
- The webhook verifies Stripe's signature and re-fetches the session. Mode,
  session ID, attempt reference, date metadata, amount and currency must match.
  Only its service-only finalization RPC creates the paid application, writes
  `grading_date`, records the receipt, and sets `under_review`, atomically.
- Unique student/event and student/date constraints and Stripe idempotency keys
  prevent repeat checkouts/applications. Webhook retries do not duplicate rows.
- The Stripe return URL only polls the owner-scoped status endpoint. Query
  parameters alone never mark an application paid.

## Deployment notes

The repository's existing Stripe integration is deliberately **test-mode only**
(`_shared/stripe.ts` rejects live secret keys). This change preserves that safety
restriction; enabling real-money production payments is a separate deployment
decision, not something this migration silently switches on.

Review existing data before migration: if a student already has multiple active
applications or checkout attempts on the same date, the unique-index creation
will fail rather than delete records or silently discard a payment. Resolve
those exceptional records manually before retrying.

After deploying, verify with a Stripe test card and an eligible test student:
open Apply for Grading, check prefilled values and that they cannot be edited, select an
official date, complete checkout, wait for the signed webhook, reload, and
confirm the paid application/date and disabled payment button. Also verify
that a second account cannot read the first account's details.

## Local verification

```sh
node --test tests/grading-application-flow-db.test.mjs tests/grading-stripe-checkout-db.test.mjs tests/grading-payment-routing.test.mjs tests/student-profile-editing-db.test.mjs
npx deno test --quiet --no-lock --node-modules-dir=none --allow-env supabase/functions/tests/
npx tsc --noEmit --noUnusedLocals false
npx vite build
```

Browser fixtures exercise the real components without contacting Supabase or
charging a card. With Vite running on port 5180:

```sh
node --test tests/mobile-responsive/grading-payment.test.mjs tests/mobile-responsive/grading-payment-receipt.test.mjs
```

The browser suite covers 320, 390, 768 and 1440px, permanently read-only prefill,
missing-profile messaging, official-date selection, eligibility gates, paid reloads and Stripe
navigation. Screenshots are written to the approved OpenCode temporary folder.
The standard `npm run build` currently fails on two pre-existing unused imports
in `src/pages/Student/GradingRequirements.tsx`; these unrelated imports were
left untouched. Type checking with only that unused-local check disabled and
the Vite production bundle both pass.
