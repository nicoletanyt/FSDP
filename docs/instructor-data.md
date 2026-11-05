# Instructor data contracts

## Implementation status and remaining roadmap

**Current checkpoint: Phase 7 is implemented and awaiting approval. Three main
implementation phases remain.** Each phase, including each mutation checkpoint,
requires the project owner's approval before the next one starts. The statuses
below describe code implementation; cloud migration deployment is verified
separately against the target project's migration history.

### Completed work

| Phase | Completed scope |
| --- | --- |
| 0–1 | Repository/schema audit and phased implementation plan. |
| 2 | Instructor types, response adapters, distinct auth/domain identities and API foundation. |
| 3 | Read APIs, pagination/aggregate contracts, database authorization and report-author protection. |
| 4 | Live calendar, availability reads and class rosters; Singapore-time projections, UUID selection and loading/error/empty states. |
| 5 | Live all-student directory, URL-backed filters, local pagination and an account-scoped in-memory snapshot. Search/filter/page changes make no further directory API requests after the initial load. |
| 6 | Live UUID student profiles, home centres, contact/emergency records, active medical alerts, cross-instructor/dojo session history, real report authors and complete attendance summaries. |
| 7 | Database-backed grading requirements/readiness, syllabus and recorded sign-offs, complete recorded assessment history, and date-only grading calendar/history compatibility. Existing UI structure and styling are preserved. |
| Approved follow-ups | Calendar access for unlinked accounts, availability creation with transactional first-save linking, and linked instructor-row provisioning during trusted account creation. Availability creation was pulled forward from the mutation phase. |

The calendar seed script and its Supabase test records are testing support, not
another implementation phase. See [calendar test records](../README.md#instructor-calendar-test-records).

### Remaining phases

The phase numbers retain the original plan. Phase 9 is deferred, so the three
remaining main phases are **8, 10 and 11**.

| Phase | Goal and principal files | Verification / completion checkpoint |
| --- | --- | --- |
| **8 — Reports and assessment-page reads** | Wire `src/pages/Instructor/InstructorStudentReports.tsx` and `src/pages/Instructor/InstructorGradingAssessment.tsx` to stored event/student records, actual previous feedback and application target grades where recorded. | Event/student composite keys, correct candidate/event association, actual authors, missing/unknown target handling, permission failures and loading/error/empty states. |
| **10 — Persisted save actions** | Connect the verified read views to real attendance, author-owned report, assessment, technique-sign-off and availability edit/delete operations. Availability creation is already implemented. | Ship the separate checkpoints below with server-enforced permissions, pending/error/retry states, preservation of unrelated fields, concurrency/idempotency checks where relevant and persistence after reload. |
| **11 — Mock cleanup and final verification** | Remove replaced production instructor fixtures, generated histories and local demo save helpers only after their replacements are verified. Preserve shared dependencies required by the out-of-scope student portal and intentional test fixtures. | Confirm instructor production imports use real data, verify complete read/write flows, and run the affected build, database/API and browser suites. Keep test fixtures explicitly scoped to tests. |

### Phase 10 mutation checkpoints

Each checkpoint is independently verified and approved before the next begins:

1. **10A — Attendance:** individual marking/clearing and transactional bulk
   marking, with approved time/ownership rules and complete roster handling.
2. **10B — Reports and assessments:** persist report text and assessment
   status/notes. An instructor edits only their own report; derive author identity
   from the linked instructor record rather than the auth-user ID.
3. **10C — Availability editing/deletion:** add the remaining mutations with
   ownership checks and authoritative Singapore-time conflict validation. Existing
   creation, first-save linking and retry behavior are retained.
4. **10D — Technique sign-offs:** persist assessment checklist marks and permitted
   undo actions using actual syllabus IDs and server-enforced signer identity.

### Decisions, scope and known follow-ups

- **Open before assessment-checklist mutations:** the current sign-off table is
  unique per student/syllabus item and has no assessment-event reference. Confirm
  whether marks persist across attempts or each assessment needs its own
  checklist before proposing any schema change.
- Photos and examiner signatures remain **browser-local**, as requested.
- **Phase 9 / QR-check-in work is deferred** and is not counted in the three
  remaining phases. The chatbot and student-portal implementation are excluded.
- Grading-result processing, belt promotions and application approvals remain
  outside scope; recorded assessments are not treated as promotion history.
- The pre-existing 1024px enlarged-text navbar overflow is documented below.
  Fixing that styling issue requires a separate UI-scope decision and is not
  hidden by weakening the browser assertion.
- Preserve the existing visual design. Add required asynchronous states, verify
  each phase, list schema/plan deviations and wait for approval at the checkpoint.

### Verification and rollback rules for remaining phases

Run `npm run build`, relevant Node/database/API tests and affected browser checks.
Backend changes also require `npm run check:functions` and
`npm run test:functions`. Lint is unavailable unless a lint script is explicitly
introduced; do not report a lint pass. Record any known failures separately.

Read-wiring rollback reverts that frontend phase. Mutation rollback disables or
reverts the newly introduced write path while preserving saved records. Database
changes use additive/follow-up migrations; retain the approved authorization
protections. Keep mocks until their replacement is verified, and add new
endpoints/fields only when grounded in the schema or separately approved.

## Phase 3: read access

Implementation: `src/lib/instructor/api.ts`, `decoders.ts`, and `types.ts`.
Database migration: `supabase/migrations/20261104120000_instructor_reads.sql`.

Use the existing authenticated Supabase client:

```ts
import { supabase } from '@/lib/supabase'
import { createInstructorApi } from '@/lib/instructor/api'

const instructorApi = createInstructorApi(supabase)
```

API operations verify the signed-in account through `users.role`. Instructors
can read all student records and related student data without a domain link or
teaching assignment. Calendar/availability reads remain personal and return empty
results when the link is absent. Identity is not cached across account changes. UUID event,
student, instructor and auth IDs remain distinct types. Runtime decoders validate
the returned rows and joins; missing records are nullable, failed queries are
errors, and malformed responses never become successful empty lists.

### Reads

| API method | Data source / behavior |
| --- | --- |
| `getCurrentInstructor` | Auth user, own `users` profile, linked `instructors` record |
| `getClassTypes` | Calendar-only class catalogue, without loading grading reference data |
| `getReferenceData` | Centres, grades, tracks, requirements, syllabus and class types; follows all pages even when the server caps responses |
| `getCalendar` | `instructor_calendar` RPC; assigned timed events overlapping `[from, to)` and date-only gradings whose Singapore day overlaps it, subtype data, centre and roster count; empty when unlinked |
| `getEvent` | Assigned event by its UUID; returns null if absent or not assigned |
| `getAvailability` | Own availability dates within `[from, to)`; empty when unlinked |
| `getStudents` | `instructor_student_directory` RPC; literal name/member-number search, grade/colour/centre filters, exact totals and full-scope facets |
| `getStudentDetail` | Student, grade, home centre, primary-first emergency contacts and active medical alerts |
| `getRoster` | Assigned event roster, paginated independently of the calendar |
| `getStudentHistory` | `instructor_student_history` RPC; history across instructors/dojos, including event/instructor/report-author identities and grading date/reporting metadata |
| `getRecordedAssessments` | Grading history where `assessment_status` is non-null; pending is recorded, null is unrecorded |
| `getStudentSummary` | `instructor_student_summary` RPC; complete past training totals and cycle attendance |
| `getSessionReports` | `instructor_event_reports` RPC; assigned class roster and up to two actual earlier class reports per student |
| `getTechniqueSignOffs` | Student/item sign-offs and nullable signer identities; follows all pages |
| `getAssessment` | Assigned grading event/student pair and actual application, if present; no inferred target grade |

Page size defaults to 50 and is limited to 1–100. Page results expose `items`,
`total`, `offset`, and `limit`. Directory results also include `scopeTotal` and
facets computed over all authorized students, independent of selected filters.
Calendar/availability ranges are limited to 62 days. Date-only strings retain
their calendar meaning; timestamps require an explicit offset. UI date/time
projections use `Asia/Singapore`. Requests accept `AbortSignal`; cancellation
has its own error code and is not an empty result.

### Visibility and report authorship

- Instructor student reads cover every dojo, including students taught only by
  other instructors, students with no event enrolment, and expired/pending members.
  This is enforced by role-based SELECT policies and the directory/history/summary
  RPCs, including for accounts without an `instructors` link.
- A domain link alone does not confer instructor permissions after role demotion.
- Broader SELECT access does not broaden event/attendance, student-profile,
  application or technique-sign-off write access. The old assignment helper is
  deliberately retained for existing mutation policies.
- A database trigger protects report text and author fields from another
  instructor's direct REST updates, author reassignment, row deletion, or spoofed
  insertion. Reports with unknown authors cannot be claimed by an instructor.
- Administrator/service operations retain their existing behavior. Mutations
  and UI edit controls are implemented in later phases.

### Attendance and readiness facts

Summary counts include only class events that have ended and are not cancelled.
They are independent of history pages and include every authorized dojo and
instructor. Present, late, absent, excused and unmarked are counted separately.
An unmarked/excused session breaks an absence streak. `lastAttended` includes
present and late attendance.

Cycle attendance includes present/late classes from `last_graded_at`, falling
back to `joined_at`, with event dates evaluated in Singapore time. These are
readiness facts, not assessment results. Technique completion is not a readiness
prerequisite. Readiness evaluation is wired in Phase 7; checklist mutations remain
a later checkpoint. The current schema cannot scope technique sign-offs to
individual assessment attempts; that decision remains open.

### Deployment and rollback

Apply the new migration to the intended database before consuming its RPCs. The
implementation does not apply migrations or deploy to Supabase Cloud automatically.
No new domain table, column, enum or reference seed is required by this migration.

The frontend read layer is additive; roll it back by reverting the instructor
data-layer release. If its RPCs need to be disabled, revoke their authenticated
EXECUTE privileges in a follow-up migration. Keep the role-demotion check,
report-author guard and `grade_requirements` RLS correction in place.

### Verification

```sh
node --test tests/instructor-db.test.mjs tests/instructor-data.test.mjs
npm run build
npm run check:functions
npm run test:functions
```

The database tests apply the complete migration chain in offline PostgreSQL with
Supabase-style roles/default grants, test cross-dojo history beyond 100 rows,
and run production response decoders over actual RPC results. API tests use the
real Supabase SDK with an offline HTTP transport. No cloud credentials are needed.

## Phase 4: calendar wiring

`InstructorLayout` supplies the production Supabase-backed API through
`InstructorApiContext`. `InstructorDashboard`, both timeline implementations,
the mobile agenda/month grid, and `ClassSessionDetails` consume stored events,
availability and rosters. Presentation colours are retained; labels, descriptions,
capacities, grades and counts come from database records.

`calendar-view.ts` projects database instants into Singapore wall-clock display
coordinates. Cross-midnight events are clipped into each overlapping day's
timeline while keeping their event UUID and original timestamps. Calendar ranges
cover the actual desktop/mobile view, including fourteen days for the mobile
agenda. `calendar-queries.ts` follows all event, availability and roster pages;
it rejects inconsistent pagination instead of displaying a partial roster.

`use-instructor-data.ts` keys requests by account and resource, aborts obsolete
requests, hides previous-resource data immediately and exposes loading, error,
retry and successful-empty states. UUID deep links are fetched independently of
the visible date range; the legacy `class` query parameter also accepts UUIDs.
Calendar return navigation preserves the real session/date query values.

Attendance mutations remain disabled until their mutation phase. Availability
creation is enabled by the follow-up below; existing availability is viewable in
its read-only dialog until editing/deletion is wired. Present/late
roster entries use first check-in time (or recorded time when check-in is absent)
and the five-minute grace period; a yellow Late badge represents late arrival.
Explicit absent/excused/unmarked states are preserved. The original mock modules
remain available to pages awaiting their own wiring; this calendar has no mock
fallback. Student-detail destinations are now wired by Phase 6 below.

Tests inject a deterministic API through the same context, exclusively from
`tests/mobile-responsive/instructor-api.fixture.ts`. Browser checks cover the
existing geometry, loading/empty/error/retry states, UUID selection, 205-student
rosters, account isolation, and late responses after date changes. Run the browser
suites sequentially as described in `tests/mobile-responsive/README.md`.

Phase 4 verification also ran the broader instructor-directory browser suite:
34 tests passed and 7 were reported failed (including parent tests). Its metadata
assertion still expects `STU-0001 · Children`, whereas the directory currently
renders `Children's grading`; its 1024px enlarged-text case reports horizontal
overflow. Directory rendering and stylesheet changes belong to the directory
phase. These failures are recorded separately from the passing calendar suite.

Phase 5 replaces the stale metadata assertions with the database-backed directory
contract. The remaining enlarged-text overflow is isolated to the existing navbar
width at `InstructorLayout.tsx` (`lg:w-[calc(92%+3rem)]`): at the 1024px test frame,
the usable viewport is 1012px while the enlarged navbar is about 1027px wide. The
directory rows and text fit. That styling issue is outside the data-only change.

## Calendar follow-up: unlinked accounts and availability creation

Migration: `supabase/migrations/20261104130000_instructor_availability.sql`.

- A signed-in instructor without a domain row still gets a navigable calendar,
  class catalogue, and Add Availability. An empty personal calendar does not
  broaden access to other instructors' events or rosters.
- Trusted instructor profile creation/role assignment inserts an `instructors`
  row with `user_id`, names and email. This runs within the database profile
  transaction used by the existing admin account-creation flow. User-controlled
  signup metadata cannot grant the instructor role.
- `createAvailability` invokes `create_instructor_availability` with the slot
  fields and an expected auth-user ID. The SQL function checks the actual auth
  user and instructor role, and derives the domain owner itself. The expected ID
  prevents an old form from being submitted under a replacement account.
- A legacy unlinked account gets its domain row on the first successful save.
  The link and availability commit together; invalid saves roll back both.
  Conflicting legacy email records are not claimed automatically.
- The owner row is locked to serialize availability writes. Instructor INSERT
  and UPDATE triggers validate future Singapore times (08:00–22:00), existing
  slots and non-cancelled assigned events, including direct REST writes. An exact
  RPC retry returns the already-saved slot.
- The form retains its draft and exposes save errors; pending submissions are
  disabled. Only a successful server response closes it and refreshes calendar
  reads. Account changes prevent an old response from navigating the new account.

This pulls availability creation forward from the original mutation phase at the
project owner's request. It adds no columns or tables. The migration must be
applied before the new create flow is used; the existing `create-instructor` Edge
Function does not need redeployment for the database trigger to take effect.

## Phase 5: instructor student directory

`InstructorStudents.tsx` reads `getStudents` through the existing instructor API
context. It loads all unfiltered pages into a page-local, account-scoped memory
snapshot, then filters and paginates that snapshot locally. The directory has no
production mock fallback. Student/centre UUIDs,
member numbers, grade labels and colours come from the database. Unranked is a
recorded grade rather than a missing-grade placeholder. Home-centre/grade join
absence remains explicit. Grading-track metadata is derived from date of birth
using the existing calendar-year age boundary (adult in the year of turning 13),
with dates evaluated in Singapore time; a future birth date is unverified.

### URL and request state

- `q`: literal, case-insensitive name/member-number search, up to 200 characters.
  The input, URL and local results update immediately; no debounce or search API
  request is needed after the initial snapshot load.
- `rank`: database `grades.id`; `belt`: stored `grades.colour`; `dojo`: centre UUID.
  Labels are read from full authorized-scope facets. Old mock dojo names are not
  treated as database identities.
- `page`: positive one-based page number, 50 rows per page. Invalid numeric pages
  use page 1; pages beyond the available result set recover to the last real
  page. Search/filter changes reset pagination and preserve unrelated URL keys.
- Result counts come from the complete cached dataset and its filtered subset,
  not the number of rows on the displayed page. Filter options cover the whole
  dataset. Only same-account facet metadata is retained during snapshot reloads;
  old rows and counts are hidden until the complete reload succeeds.
- Loading, failed reads, an empty student database, and no matching students have
  distinct states. Failed reads cannot become a successful zero count. Retry,
  clear/reset actions, browser Back, focus return and open popovers are preserved.
- An unlinked instructor has the same all-student read access as a linked one.
   Student-detail links carry real UUIDs; Phase 6 now wires the destination to
   real profiles/history and the geometry checks follow those same UUID links.

### Schema reconciliation

The offline database suite now also applies the five fetched cloud migrations,
using only a test-local official-venue prerequisite. Those migrations did not
change the directory's student/grade/centre fields. They did reveal that the
fetched reset SQL lacks `grade_requirements` policies, so the additive
`20261105120000_instructor_reference_policies.sql` migration restores intended
authenticated reads and administrator-only management. It is safe to apply when
those named policies already exist; no existing migration file is rewritten.

The schema reference now records the fetched grading date/reporting fields,
nullable grading timestamps and invitation settings. The instructor timed-event
model/calendar projection still needs a separate date-only grading compatibility
update; Phase 5 does not interpret null grading timestamps or invent a time.

### Verification and rollback

Run `tests/instructor-directory.test.mjs`, `tests/instructor-data.test.mjs` and
`tests/instructor-db.test.mjs` plus the directory/calendar browser suites. Cases
include server pagination over 100 directory rows, a 205-student browser directory,
global facets/totals, Unranked, local filtering without additional requests,
account isolation, failed partial snapshot loads,
invalid filters, page recovery, keyboard behavior and existing layout geometry.

Roll back directory wiring by reverting this frontend phase; keep the reference
RLS policy correction. Apply that new migration to Supabase separately from
frontend deployment. No new table, column, enum or write endpoint is introduced.

## Phase 5 correction: all students

`supabase/migrations/20261105130000_instructor_all_students.sql` supersedes the
original teaching-relationship read scope. All authenticated accounts with
`public.users.role = 'instructor'` can read every student row, emergency contact,
medical alert, event/student history row, grading application and technique sign-off.
There is no membership-status, centre, enrolment, or domain-link prerequisite.
Search and selected filters still narrow the displayed results, and pagination
still applies to the global student set.

The migration adds SELECT policies rather than modifying the assignment helper,
which also participates in existing write policies. Report-author protection and
other write rules remain independently enforced. Student accounts keep their
existing self-access, and anonymous access is not expanded. Directory, individual
student, history, summary, reference and sign-off API reads verify the role rather
than requiring an instructor-domain record. Calendar/roster ownership and
availability writes continue to use linked instructor identity.

Verification includes another instructor's student, a student with no enrolment
and expired membership/outstanding fees, unlinked instructor access, global totals
and facets, contacts/medical/history/application/sign-off reads, role demotion,
student/anonymous denial, and denial of newly attempted writes to unrelated
student data. Apply this additive migration to Supabase for the new read scope.

## Phase 5 follow-up: in-memory directory filtering

`loadDirectorySnapshot` in `src/lib/instructor/directory.ts` loads the complete
authorized directory using the existing `getStudents` API in unfiltered chunks
of up to 100 rows. It follows actual returned page lengths, rejects duplicate or
inconsistent pages, and exposes no partial cache if a later page fails.

`InstructorStudents.tsx` keys its data request only by the account and snapshot
reload revision. Its `useMemo` calls `filterDirectorySnapshot`, which uses
`Array.filter()` for name/member-number, grade, colour and dojo matching, then
`Array.slice()` for the existing 50-row visible pages. URL-backed state, global
filter metadata and page recovery are preserved. Typing, changing filters and
switching visible pages make no further directory API requests.

The snapshot lives only while the directory page is mounted. Reopening or
refreshing the page loads current data; existing Retry and empty-directory
Refresh actions reload the snapshot. Changes made elsewhere are not synchronized
automatically while the snapshot is open. No student data is written to browser
storage, and logout/account changes discard the old page state and abort pending
loads. The initial download is larger than the previous one-page read.

The browser fixture records directory request arguments: with 205 students, the
initial load requests offsets 0, 100 and 200. Search, rank/belt/dojo changes and
visible pagination leave that request count at three. Unit/browser tests also
verify partial-page failure and retry, immutable filtering, literal search,
complete facets and account isolation. This is a frontend data/state change;
the existing API and database migration contracts are retained.

## Phase 6: student details and session history

`InstructorStudentDetails.tsx` uses `getStudentDetail` through the instructor API
context. Names, member numbers, grades, home centres, membership status, email,
phone, primary-first emergency contacts and active medical alerts come from stored
records. Missing optional joins, phone numbers, contacts and alerts have explicit
states. A missing student is distinct from a failed read or malformed UUID.

The existing sidebar/mobile cards, contact/medical dialogs, tabs, page gutters and
card insets are retained. `session` and legacy `class` context values accept UUIDs.
Context loads the assigned event and its complete roster, independently of the
calendar's visible range; previous/next student links retain the selected session
and tab. Calendar return links use the actual UUID and Singapore date. Unavailable
or failed context reads do not prevent access to the student's profile/history.

`StudentSessionHistory.tsx` reads class history across all instructors and dojos,
in pages of 20. Attendance filters (present, late, absent, excused and unmarked)
and date ordering apply to the entire server-side history, reset pagination, and
retain the active controls during loading/error/retry. Each page exposes its full
filtered total. Cancelled sessions remain visible and labelled in history.
Singapore date/time formatting includes the end date for cross-midnight sessions.
The class instructor and actual report author are separate identities; an absent
report author is explicitly unknown and is never replaced with the class teacher
or signed-in account. Report text has no generated fallback.

Overview attendance comes directly from `getStudentSummary`, independently of
history filters/pages. It shows all six training totals, complete reporting dates,
last attended class/centre, absence streaks and current-cycle attendance. Present
and late count as attended; the rate denominator is present + late + absent.
Excused and unmarked counts are shown separately and excluded from the rate.
Recent feedback is a separate newest-first, reports-only class-history query;
reports outside the first visible history page remain discoverable.

Every request uses the existing account/resource-scoped hook, with cancellation,
loading, errors/retry and successful-empty states. Account/student changes hide
old profiles, feedback and history immediately, even when obsolete transports
resolve late. Student reads continue to support verified unlinked instructors
and students without enrolment or active membership.

### Checkpoint boundary and schema/plan deviations

No schema, API endpoint, backend function or write-permission changes are needed.
Report add/edit controls are disabled until Phase 10B and cannot emit a demo save.
The old grading sections depended on generated profiles, inferred promotion
history and browser-local technique saves. Their section headings/cards remain,
with an explicit unavailable message and disabled review control pending Phase 7;
no synthetic eligibility, assessment or next-grade result is displayed for a real
UUID. The legacy mock/helper modules remain for later cleanup and other consumers,
including browser-local signature helpers. Phase 7 now adapts the original
structured grading cards and review dialog to real reference/sign-off data.
Review shows recorded technique marks read-only. Browser-local signature helpers
and the approved local-only signature policy are retained. No Phase 10 mutations
are implemented here.

### Verification and rollback

- `npm run build` passes (existing bundle-size advisory remains).
- `node --test tests/instructor-student-detail.test.mjs tests/instructor-data.test.mjs tests/instructor-db.test.mjs tests/instructor-directory.test.mjs`: 50 passing tests.
- Student-detail browser checks pass, covering 320–1440px geometry, stored
  contacts/medical records, 205-session pagination and independent totals, filters,
  actual/unknown authors, UUID context, empty/error/retry states, unlinked reads,
  account changes and late responses after student changes.
- Calendar browser suite: 21 passing tests.
- Directory browser suite: 45 passing, 2 failed including the parent test. The
  failure is the already documented 1024px/200%-text navbar overflow; all six
  directory/detail geometry comparisons pass using real UUID destinations.

Browser checks use test-only API records from `instructor-detail.fixture.ts` and
run sequentially as described in the browser README. Cloud deployment is not
performed by these checks. Rollback reverts the Phase 6 frontend wiring while
retaining all approved database authorization migrations and stored records.

## Phase 7: grading reads and readiness

Implementation: `src/lib/instructor/grading.ts`,
`src/components/instructor/StudentGradingRead.tsx`, the existing student-detail
page, instructor event decoders/types/adapters and calendar projection.
Migration: `supabase/migrations/20261105140000_instructor_grading_reads.sql`.

### Read contracts

`loadStudentGrading` uses the existing `getReferenceData`, `getStudentSummary`,
`getTechniqueSignOffs` and `getRecordedAssessments` operations. It follows every
recorded assessment page, including server-capped pages beyond 100 rows. A failed
read or inconsistent page does not produce a partial successful grading view.
Requests retain the existing account/student keys, cancellation, loading modal
and retry behavior; old-account and late old-student responses remain hidden.

Next grades are selected from database `grades.sort_order` and `grade_tracks`,
using the existing Singapore calendar-year age rule (adult in the year of turning
13). No mock rank slug, hard-coded belt ladder or label is used to identify a
grade. Requirements come from the selected target's grade/track row. Missing
reference data and terminal ladders remain explicit and cannot produce Ready.

Ready means **ready to start assessment**. It checks active membership, the
existing three-month membership rule, published calendar-year age and minimum
time/session requirements, and recorded outstanding fees. Unranked practice time
starts at joining; ranked time requirements need the actual last-grading date.
Future/unknown required dates are unverified. Published maximum month ranges are
descriptive, not expiry dates. Session requirements use complete `cycleAttended`
aggregates with matching `cycleStart`, independently of history pages and filters.

Syllabus items use real IDs, categories, labels and notes. Matching stored
sign-offs retain their actual date, nullable signer identity and notes. Earlier
grade and other-student marks do not count toward the displayed target syllabus.
**Technique completion is excluded from readiness**, including when no syllabus
items have been recorded. Technique assessment/checklist writes remain Phase 10D.

Grading history includes every returned recorded pending/completed assessment,
actual notes, instructor/centre and the application's target grade where recorded.
It never derives a historical from-grade, passed result, promotion or missing
target from the student's current/next grade.

### Date-only compatibility

The event model accepts paired null timestamps only for grading events and
decodes the fetched `grading_date`, `application_opens_on`,
`reporting_release_on`, `reporting_time` and `official_schedule` fields. A dated
calendar grading with no timestamps must have a recorded grading date. Unknown
end times stay unknown; arrival-based lateness is not inferred without a stored
event start.

The additive migration introduces the security-invoker `instructor_calendar`
read RPC. It applies role checks, personal instructor ownership, bounded ranges,
stable pagination and all existing RLS. It includes date-only gradings by their
Singapore calendar day alongside overlapping timed events. Sorting/filtering
uses day boundaries only as comparison coordinates; returned event timestamps
remain null. Unlinked instructors get an empty personal calendar. This does not
make unassigned official schedules part of another instructor's calendar.

The existing history RPC signature/ACL is retained. It now returns nullable
grading metadata and includes past/current-date gradings with null timestamps,
using a stable date/UUID order. Date-only future gradings are excluded from past
history. The complete attendance-summary RPC is unchanged and still counts only
ended, non-cancelled class events.

Calendar month/list cards and existing selection panels show the stored grading
date. They show an actual reporting time only on/after its recorded release date;
otherwise the label is Time not published. No reporting timestamp, midnight start,
end time or duration is invented. Date-only events do not become hourly timeline
blocks, even when a reporting time is published without a duration.

### UI boundary and schema/plan deviations

Following the owner's clarification, live data adapts the original structured
grading design rather than flattening its contents into paragraphs. Eligibility
has current/next database grade badges, a readiness badge, requirements-met
progress and icon-led requirement rows with actual/required values. The overview
summary has a View grading action. Assessment history uses separate entries with
actual target badges, status, date/instructor/centre and stored notes; it has no
inferred historical from-grade transition.

Review grading opens the existing-style responsive review dialog and category
accordion, with technique progress and stored sign-off dates, signer identities
and notes. Checkboxes are disabled until persisted mutations are implemented.
Technique progress remains separate from readiness. No local/demo save path is
re-enabled. The page shell, contact cards, badge/track positioning, attendance
popover, loading modal and typography/spacing patterns are retained. An all-day
timeline region remains deferred. Existing browser-local signature/photo helpers
and stored values are untouched.

No table, column, enum, seed, write endpoint, mutation policy or Edge Function is
changed. The migration adds only a schema-grounded calendar read RPC and replaces
the existing history read function to include date-only records/metadata. Apply
this migration to the target Supabase project **before deploying the frontend**;
no Edge Function redeployment is required. Cloud deployment is separate from the
offline verification below.

### Verification and rollback

- `npm run build`: passes; the existing bundle-size advisory remains.
- Relevant Node suites (grading, API, offline database, calendar projections,
  directory, student details, calendar helpers and calendar seed support): 79
  passing tests, including 205 date-only events and recorded-history pagination.
- `npm run check:functions`: passes.
- `npm run test:functions`: 5 top-level tests and 16 steps pass.
- Student-detail browser suite: 23 passing tests, including structured requirement
  rows/progress and bounded review dialogs at 320/390/768/1440px, read-only
  checkboxes, real syllabus/sign-off/assessment data, readiness without techniques,
  empty/missing records, failure/retry and account isolation.
- Calendar browser suite: 22 passing tests, including date-only unpublished and
  released reporting times, existing cards/drawers, no fabricated timeline blocks,
  and the existing responsive/availability flows.
- Targeted directory/detail geometry comparison: 7 passing tests (parent plus six
  widths, 320–1440px). The previously documented 1024px enlarged-text navbar
  overflow remains a separate known UI issue; its assertion is not weakened.

Rollback reverts the Phase 7 frontend/read-model wiring. Keep the additive read
migration and all existing authorization/report-author protections; it does not
alter stored records. If disabling the new calendar RPC is necessary, revoke its
authenticated EXECUTE privilege in a follow-up migration. No Phase 8 read views or
Phase 10 save actions are implemented by this checkpoint.
