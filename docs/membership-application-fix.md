# Membership application schema repair

## Cause

`src/pages/Student/ApplyMembership.tsx` was the only source reference to
`student_profiles`. No migration creates that table. The canonical student table
is `public.students`; changing only the table name would still fail because
`full_name`, `dob`, `principal_dojo`, etc. do not match its columns. A subsequent
browser upsert into `credit_accounts` also violates its server-only write grants
and could erase purchased credits if those grants were loosened.

## Existing migrations

- `supabase/migrations/20261102041227_reset_and_domain_schema.sql`: creates
  `students`, `centres`, `emergency_contacts`, `student_medical_alerts`, reference
  tables and RLS. **This is a destructive reset; do not rerun it on a populated
  database to fix this error.**
- `supabase/migrations/20261105211923_membership_checkout.sql`: service-only
  membership application/finalization functions. These cannot be called directly
  by the browser.
- `supabase/migrations/20261113120000_credit_checkout.sql`: credit accounts,
  purchase receipts and server-only credit finalization.

## Apply the additive repair

Copy the **entire contents** of
`supabase/migrations/20261114142809_membership_application_submit.sql` into
Supabase SQL Editor and run it as the database owner. It assumes the existing
domain/credit migrations have been applied, is safe to rerun, does not delete
existing data and reloads the PostgREST schema cache. Deploy the updated frontend
at the same time. This repair does not require a new Edge Function.

The browser now calls `submit_my_membership_application(application)`; the RPC
derives the account from `auth.uid()` and serializes requests per account. It
creates/updates a pending `students` row and its primary emergency contact and
stores medical alerts. Active memberships and earned grades are not overwritten.
Credit accounts are initialized only if absent, inactive and with zero credits;
existing balances and flags remain untouched. The response supplies the actual
database member number, joining date, status and rank, rather than random UI IDs.

Run `supabase/migrations/20261114145709_fix_membership_id_generation.sql` after
the repair to generate `ASJ<year><four digits>` member numbers. A database trigger
replaces missing/UUID-default member numbers on insert, with serialized random
allocation and collision retries. Student primary keys remain UUIDs. Existing
numbers are not bulk-rewritten; an administrator can explicitly reallocate one
legacy UUID member number with `update public.students set member_no = id::text
where user_id = '<auth-user-uuid>';`. Already assigned ASJ/imported numbers remain
unchanged on ordinary application retries. Four random digits from 1000–9999
allow at most 9,000 distinct member numbers per year.

Apply `supabase/migrations/20261114161341_membership_application_confirmation.sql`
after the ASJ migrations for the saved-application confirmation screen. It adds
`get_my_membership_application()` and returns the saved `currentBelt` as
`declaredBelt`/`beltRank`, while keeping the separately verified student grade in
`verifiedRank`. The read is owner-scoped and does not expose NRIC, guardian or
medical fields. Both submit and refresh use the stored application snapshot;
missing historical belt data is shown as “Not provided”, never invented as White.

### Form field storage

`students`: `fullName` → `first_name`/`last_name`, authenticated email → `email`,
`mobile` → `phone`, `dob` → `date_of_birth`, `principalDojo` → `home_centre_id`.
The dojo selector now reads real active centres and submits UUIDs.

`emergency_contacts`: `emergencyName`, `emergencyRelationship`, `emergencyPhone`.

`student_medical_alerts`: nonempty `medicalDetails`.

`membership_private.application_details.form_data` is a complete JSONB snapshot:
`fullName`, `nric`, `nationality`, `dob`, `gender`, `email` (server-verified),
`mobile`, `address`, `photoName`, `principalDojo`, `membershipType`, `currentBelt`,
`hasExperience`, `experienceDetails`, `emergencyName`, `emergencyRelationship`,
`emergencyPhone`, `medicalDetails`, `guardianName`, `guardianNric`,
`guardianRelationship`, `guardianPhone`, `parqAnswers`, `waiverSigned`,
`isDeclared`. The claimed belt is for review, not an awarded grade.

The photo picker still records a filename only; no image bytes are uploaded by
this page. Implementing Storage upload is a separate feature.

### RLS

Missing-table/schema-cache errors are not fixed by disabling RLS. Production
keeps RLS enabled. Sensitive snapshots are in a non-exposed schema and have no
browser table grants or read policies. Only the authenticated, owner-checked
submission function can write them. Do not add `membership_private` to the Data
API's exposed schemas.

If you explicitly want **RLS disabled for the new private snapshot table in an
isolated test database**, run this after the repair:

```sql
begin;
revoke all on membership_private.application_details from public, anon, authenticated;
alter table membership_private.application_details disable row level security;
commit;
```

This deliberately does not grant browser table access. The RPC still works.
Do not disable RLS on `public.students` or `public.credit_accounts`: existing
SELECT grants would expose other users' data. Restore the private table's
defense-in-depth protection with:

```sql
alter table membership_private.application_details enable row level security;
```

### Verify in SQL Editor

After submitting a test application through the updated frontend:

```sql
select to_regclass('public.students') as student_table,
       to_regprocedure('public.submit_my_membership_application(jsonb)') as submit_rpc;

-- Substitute the test account's Auth UUID, not a real person's NRIC.
select s.member_no, s.membership_status, s.current_grade_id,
       d.submitted_at, c.credits, c.unlimited, c.active
from public.students s
join membership_private.application_details d on d.student_id = s.id
left join public.credit_accounts c on c.user_id = s.user_id
where s.user_id = '00000000-0000-4000-8000-000000000001';
```

No hosted database was changed or inspected during this repair. Offline
Postgres tests cover permissions, full field persistence, ownership, retries,
rollback, minor guardians, real centre validation, grade protection and credit
preservation. Run `node --test tests/membership-application-db.test.mjs` and
`npm run build`.
