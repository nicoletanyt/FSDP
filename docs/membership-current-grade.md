# Membership initial-grade persistence

Apply `supabase/migrations/20261116063221_membership_current_grade.sql` after the
existing membership submission, ASJ number, and confirmation migrations. This
is additive; do not replay the old domain reset on an existing database.

## Cause

The original `membership_private.submit_application` deliberately stored
`currentBelt` only in the private Membership snapshot. Its student INSERT omitted
`current_grade_id`, so the default `unranked` remained in effect. The public RPC
also had later wrappers for ASJ IDs and application confirmation; changing only
the oldest public function definition would bypass those fixes.

## Fix

The current public RPC still calls the validated private transaction and preserves
ASJ allocation, ownership checks, contacts and credits. Its updated private wrapper
resolves and writes the requested initial grade to `students.current_grade_id`
within the same transaction, before returning. It accepts `currentBelt`,
`current_grade_id`, or both; both must resolve to the same grade when supplied.
Only existing catalogue grades are accepted. Existing active/expired ranks and
records with `last_graded_at` are not overwritten by Membership resubmission.

`ApplyMembership.tsx` fetches the grade catalogue and submits the exact
chosen ID under both fields. The latest DOB-specific dropdown shows 15 children's
Kyu ranks or seven adult ranks, distinguishing precise Kyu grades instead of
collapsing all black grades into a generic "Black belt". Catalogue loading errors
are shown with a retry action; an unavailable or invalid selection cannot proceed.

For compatibility, old colour values with an unambiguous Kyu mapping are resolved
against the catalogue (for example `green` → `green-8th-kyu` or `8-kyu`, whichever
unique ID exists). Unknown, conflicting or ambiguous values raise an error; they
never silently become Unranked. Generic historical `black` requires an exact
catalogue grade rather than guessing a Dan level.

The migration also repairs historical NULL/Unranked defaults using the same
student's saved Membership snapshot, provided `last_graded_at` is NULL. Existing
ranked grades are left untouched. Snapshots with ambiguous/invalid/conflicting
rank values are skipped for manual dojo review, not guessed or overwritten.

The initial implementation required deployment to the connected Supabase project.
A later live investigation found that a name/email wrapper replacement had lost
this write again. The durable follow-up was deployed and verified against the real
database/API; see [membership-grade-sync.md](membership-grade-sync.md). That fix
preserves the deployed wrapper rather than blindly replaying older definitions.

## Verification

```sh
node --test tests/membership-application-db.test.mjs tests/membership-current-grade.test.mjs
npx tsc --noEmit --noUnusedLocals false
```

The offline PostgreSQL test exercises the real public RPC through its full private
wrapper chain: initial Green persistence, exact grade IDs, ID-only requests,
invalid/conflicting IDs, historical default repair, confirmation labels, rollback,
ownership, credits and active-rank preservation. The source-level frontend test
checks the canonical-ID dropdown/submission contract; it is not a browser check.
