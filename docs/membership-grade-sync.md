# Durable Membership initial-grade synchronization

## Confirmed cause

The application and linked Supabase project were checked against each other.
The live private Membership snapshot contained the selected canonical Brown-Gold
3rd Kyu ID, while `students.current_grade_id` still contained `unranked`.

The deployed `submit_formatted_application` had subsequently been replaced by a
version adding multipart name and editable contact-email support. That version
called the original Membership transaction, which does not persist the declared
rank, and no longer included the initial-grade write from the earlier repair.
Profile and Grading were correctly reading the same stale student-row value;
changing their displayed labels would not fix eligibility or payment pricing.

## Deployed fix

`supabase/migrations/20261116084104_durable_membership_grade_sync.sql` adds a
private-schema snapshot-write trigger. It synchronizes a pending application's
initial grade in the existing transaction, independently of which submission
wrapper calls it. The deployed name/email wrappers are not replaced; their
function-definition fingerprint was verified unchanged after deployment.

The trigger uses the existing canonical-grade resolver and checks both student
and account ownership. It rejects conflicting/invalid grades, does not change
active/expired memberships or grading history, and does not replace unrelated
staff/imported ranks. Pending edits may update only a default initial rank or
one matching that account's preceding saved declaration. A failed contact write
rolls back the initial-grade change with the rest of the application.

No frontend writes or display-only overrides were introduced. No direct private
schema permissions were granted to browser roles. A regression test deliberately
replaces the submission wrapper with a name/email-only version and verifies that
the grade still persists while multipart names/contact email remain intact.

## Live verification performed

The new trigger migration was applied to the linked project and recorded as
applied in migration history. The specifically reported default-grade record was
repaired separately, using its saved canonical declaration and explicit account,
membership, old-grade and no-grading-history checks. No global student-grade
rewrite was performed; the other screenshot account's saved White rank was left
unchanged.

The repaired account was then read through the actual Supabase REST API and
`student_grading_readiness`: current Brown-Gold (3rd Kyu), next Black (2nd Kyu),
adult track, S$90 base examination fee. Existing training/membership minimums
remained unmet where appropriate; no attendance, eligibility, credits or payments
were granted by the repair. Security advisors reported no error-level issues.

## Read-only diagnostic

```sh
node scripts/verify-membership-grade.mjs MEMBER_NO EXPECTED_GRADE_ID
node --test tests/membership-application-db.test.mjs
```

The diagnostic uses Vite's development environment precedence, queries the real
student grade relation and authoritative grading rules/fee, and exits non-zero
if an expected grade does not match. It requires a server-side service key, must
not be imported into frontend code, never logs that credential, and performs no
database writes. No NRIC, medical, address or full Membership snapshot is printed.

Existing browser tabs can retain their previous loaded state: refresh Profile
and Grading after a database repair. No access to the user's logged-in browser
was used or claimed during this server/API verification.
