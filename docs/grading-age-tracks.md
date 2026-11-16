# Age-specific membership ranks and grading rules

## Age convention

ASK's official page explicitly uses age **by year**: applicants aged 5–12 in
the calendar year use children's grading, and 13+ use adult grading. DOB is
authoritative (`students.date_of_birth`), not a user-selected membership/pass
discount type. No `student_profiles` table is assumed.

`gradingTrackForDob` uses the Singapore calendar date and the same year-of-birth
calculation as the database readiness, official schedule and checkout functions.
For example, a student born on December 31, 2013 uses the adult track throughout
2026, including before their birthday. Missing/invalid/future DOB does not default
to adult: the Membership rank selector is disabled until DOB is valid.

## Membership dropdown

`src/lib/grading-tracks.ts` contains the requested ordered 15 children's Kyu
options and seven adult options (Beginner plus 6th through 1st Kyu). The displayed
labels use rank-first formatting. Option values are resolved from real catalogue
IDs, including supported legacy numeric IDs. Missing or ambiguous grade mappings
are reported instead of inventing an ID or silently omitting requested ranks.

Changing DOB clears a previously selected rank that no longer belongs to the
applicable list. Ranks shared by both lists remain selected. The exact canonical
ID is still submitted to the Membership RPC and written by the preceding initial
grade migration. The former all-catalogue/Dan dropdown is superseded by these
two explicit lists as requested; existing stored Dan ranks are not deleted.

## Eligibility and fees

Apply `supabase/migrations/20261116064918_grading_track_requirements_and_fees.sql`
after the existing eligibility and fee migrations. It upserts the published Kyu
rules and fees into `grade_requirements`, keyed by **grade and track**, and ensures
the corresponding catalogue track memberships exist. It does not create invented
grades or replace the secured readiness/checkout RPCs.

| Target | Adult minimum | Children minimum | Base fee |
| --- | --- | --- | --- |
| 12th Kyu | — | Age 5 by year + 3 months | S$45 |
| 11th / 10th / 9th Kyu | — | 4 months | S$45 |
| 8th Kyu | — | 4–6 months | S$45 |
| 7th Kyu | — | 6 months | S$45 |
| 6th Kyu | 3 months + 20 sessions | 6 months | S$50 |
| 6th Kyu Silver | — | 6 months | S$50 |
| 5th Kyu | 24 sessions | 6 months | S$55 |
| 4th Kyu | 32 sessions | 10 months | S$60 |
| 4th Kyu Silver | — | 10 months | S$60 |
| 3rd Kyu | 6 months + 36 sessions | 8–10 months | S$65 |
| 2nd Kyu | 6 months + 56 sessions | Age 12 by year + 10 months | S$90 |
| 2nd Kyu Silver | — | 10 months | S$90 |
| 1st Kyu | 9 months + 62 sessions | Existing age-gated adult crossover | S$95 |

The children's Membership list includes 1st Kyu as requested, but selecting an
already-held rank does not waive official exam-age rules. Existing crossover,
adult intermediate-grade exceptions, Dan rules, membership minimums, outstanding
fee checks and instructor sign-offs are preserved. Issued Stripe sessions keep
their fixed fee/date; new unissued quotes use the updated requirement row.

`StudentGrading.tsx` uses the target grade and track returned by
`my_grading_readiness`, not just a client-side rank ordering. That same track
selects the displayed fee. This also keeps crossover and age-limited Dan targets
consistent with the server. Eligibility headings show **Adult Track** or
**Children Track**, with the calendar-year convention explained underneath.

No hosted database was changed. Apply the migration to the actual connected
Supabase project before expecting its stored eligibility/fees to change.

## Verification

- Unit tests cover exact option lists, 12/13-by-year boundaries, invalid DOB,
  aliases, missing catalogue data and authoritative target/fee selection.
- Offline PostgreSQL tests call the actual readiness RPC and verify adult Blue
  (3 months / 20 sessions) versus children's Blue (6 months / no session minimum),
  S$50/S$55 fees, adult Brown's 32 sessions and existing crossover safeguards.
- Real Chrome tests cover Membership DOB changes, clearing/preserving ranks,
  eligibility track headings, payment gating and responsive 320–1440px layouts.
- Desktop and mobile screenshots were reviewed. Type checking passed with the
  existing unrelated unused-local import failures disabled.
