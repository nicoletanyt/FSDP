# Instructor data contracts

## Implementation status and remaining roadmap

**Current checkpoint: Phase 10B (reports and assessments) is implemented and awaiting approval.
Phase 10 is in progress; Phase 11 remains.** Each phase, including each mutation checkpoint,
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
| 8 | Live class report cards with complete rosters, actual current/previous report authors and feedback; read-only assessment forms keyed by event/student UUIDs with recorded application targets and status/notes. |
| 10A | Persisted individual present/absent/clear and atomic full-roster attendance saves, authoritative reloads, server ownership/time checks, stale-snapshot conflicts and durable retry receipts. |
| 10B | Author-owned report add/edit/clear and persisted assessment status/notes, with linked domain authorship, field-scoped concurrency checks, durable retry receipts and draft-preserving reloads. |
| Approved follow-ups | Calendar access for unlinked accounts, availability creation with transactional first-save linking, and linked instructor-row provisioning during trusted account creation. Availability creation was pulled forward from the mutation phase. |

The calendar seed script and its Supabase test records are testing support, not
another implementation phase. See [calendar test records](../README.md#instructor-calendar-test-records).

### Remaining phases

The phase numbers retain the original plan. Phase 9 is deferred, so the two
remaining main phases are **10 and 11**.

| Phase | Goal and principal files | Verification / completion checkpoint |
| --- | --- | --- |
| **10 — Persisted save actions** | Connect the verified read views to real attendance, author-owned report, assessment, technique-sign-off and availability edit/delete operations. Availability creation is already implemented. | Ship the separate checkpoints below with server-enforced permissions, pending/error/retry states, preservation of unrelated fields, concurrency/idempotency checks where relevant and persistence after reload. |
| **11 — Mock cleanup and final verification** | Remove replaced production instructor fixtures, generated histories and local demo save helpers only after their replacements are verified. Preserve shared dependencies required by the out-of-scope student portal and intentional test fixtures. | Confirm instructor production imports use real data, verify complete read/write flows, and run the affected build, database/API and browser suites. Keep test fixtures explicitly scoped to tests. |

### Phase 10 mutation checkpoints

Each checkpoint is independently verified and approved before the next begins:

1. **10A — Attendance (implemented):** individual marking/clearing
   and transactional bulk marking, with time/ownership rules and complete roster handling.
2. **10B — Reports and assessments (implemented; awaiting approval):** persist report text and assessment
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
- **Phase 9 / QR-check-in work is deferred** and is not counted in the two
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
| `getSessionReports` | `instructor_event_reports` RPC; assigned class roster, actual current report author and up to two actual earlier class reports per student with their authors |
| `getTechniqueSignOffs` | Student/item sign-offs and nullable signer identities; follows all pages |
| `getAssessment` | Assigned grading event/student pair and actual application with nullable joined target-grade details, if present; no inferred target grade |

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

Phase 10A below now enables the verified attendance mutations. Availability
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
Phase 10B below now connects report add/edit controls to persisted saves.
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

## Phase 8: class reports and assessment-page reads

Implementation: `InstructorStudentReports.tsx`, `InstructorGradingAssessment.tsx`,
`src/lib/instructor/session-reads.ts` and the existing instructor API/decoders.
Migration: `supabase/migrations/20261105150000_instructor_report_authors.sql`.

### Class reports

`/instructor/reports/:eventId` resolves an assigned class independently of the
visible calendar range and loads every `getSessionReports` page before rendering
the roster. Stable event/student composite keys, full totals and pagination checks
prevent duplicate or partial rosters from appearing as a completed load. A missing
or non-class event, successful empty roster and failed read remain distinct.

The existing one-column/mobile and two-column/desktop report cards are retained.
Student names/grades, all five attendance states and current report text come from
stored rows. Each card displays up to two actual earlier class reports returned by
the existing RPC, including earlier sessions with other names, instructors or
dojos. There are no generated seven/fourteen-day dates or example-feedback
fallbacks. Missing current/earlier feedback has an explicit empty state.

Current and earlier report authors use the actual `instructors` row referenced by
`report_author_id`. Missing authors remain unknown and are not replaced with the
assigned class teacher, signed-in account or an auth-user ID. Decoders reject
mismatched author/student/event identities, duplicate/current-session previous
reports, more than two earlier reports and mismatched page metadata.

### Assessment reads

Canonical `/instructor/assessments/:eventId/:studentId` and legacy
`/instructor/assessments/:eventId--:studentId` routes require an exact pair of real
UUIDs. The API resolves the assigned grading event and its matching enrolment;
an application or student record alone does not create an assessment. Wrong event
types, non-candidates, missing events and malformed keys do not display a form.

The original form layout is retained: current/target grade summary, status
buttons, notes textarea, profile link and Save Assessment control. Current grade
comes from the stored student join. Target grade comes exclusively from that
student/event application's `target_grade:grades(*)` join. It is not derived from
the current grade, next-grade ladder or event's target-grade catalogue. A missing
application and a recorded target whose grade details are unavailable have
different messages.

Pending/completed status and notes are displayed exactly as recorded. Null status
is unrecorded, with neither status button selected. Status buttons and Save
Assessment are disabled; notes are selectable/read-only. There is no browser-local
save helper or demo-success message. Assessment records do not imply passed
promotions, and the schema has no separate assessment-author field to infer.

The existing grading-roster action now links to the corresponding canonical
event/student assessment. Profile and calendar return links retain the same event
UUID, student UUID, relevant tab and actual Singapore/date-only grading date.
Date-only assessments do not gain synthetic start/reporting timestamps.

### Request state and authorization

Both pages use the existing account/resource-scoped query hook and shadcn loading
modal, with errors/retry, successful-empty/not-found states and cancellation.
Account changes immediately discard old records. Late responses after changing
class or candidate cannot overwrite the replacement view. A failed later report
page exposes no partial roster, and Retry starts a complete new load.

These event-specific reads still require the linked instructor's assigned event;
the broader all-student directory/history permission does not grant access to
another instructor's report page or assessment. Existing SQL role, ownership,
RLS and report-author write protections are retained.

### Schema/plan deviations and deployment

The additive migration replaces only the existing security-invoker report RPC,
adding the current report author's nullable record to its JSON response. Its
signature, ACL, class ownership checks and previous-report scope are preserved.
The assessment API adds a schema-grounded grade join to the existing application
read. No table, column, enum, seed, new endpoint, write policy or Edge Function is
added or changed.

Apply `20261105150000_instructor_report_authors.sql` to the intended Supabase
project before deploying this frontend. Cloud migration deployment is separate
from the offline checks; no Edge Function redeployment is required. Mutations
remain Phase 10B, and no later checkpoint starts automatically.

### Verification and rollback

- `npm run build`: passes (existing bundle-size advisory remains).
- Relevant Node suites: 64 passing checks covering session-read helpers, API,
  offline database, grading, calendar projection and student-detail helpers.
  Database tests include 205 report students with unknown authors/no earlier
  feedback, cross-dojo earlier feedback, authorization and report-write guards.
- `npm run check:functions`: passes.
- `npm run test:functions`: 5 top-level tests and 16 steps pass.
- New reports/assessment browser checks: 19 passing tests, including both layouts
  at 320/390/768/1440px, actual authors, target-grade differences, no application,
  unknown grade joins, null status/notes, read-only saves, legacy/canonical UUIDs,
  date-only dates, 205 reports, partial-page failure/retry, permission denial,
  account/candidate/class isolation and calendar → assessment → profile navigation.
- Targeted student-detail loading/retry and structured grading/review regression
  checks: 6 passing tests (including parent/width subtests).
- A pre-existing date-only database test assumed a fixed number of timed events
  within a Singapore day. Near midnight, an additional cross-midnight class can
  legitimately overlap it. Its expected total now uses the stored overlapping
  timed rows plus the date-only grading, retaining ownership assertions.

Rollback reverts the Phase 8 frontend/API read wiring. Retain the additive report
author migration and all authorization guards; its extra JSON field is compatible
with older consumers, and no stored report/assessment record is changed.

## Phase 10A: persisted attendance

Implementation: `src/lib/instructor/attendance.ts`, `use-instructor-attendance.ts`,
the instructor API/decoders and the existing `ClassSessionDetails` controls.
Migration: `supabase/migrations/20261105160000_instructor_attendance.sql`.

### Attendance rules and interface

The existing present/absent buttons now save to Supabase. Selecting an already
marked present/absent value clears it to database null (Unmarked). Bulk buttons
retain their existing Mark All Present / Mark All Absent behavior over editable
entries. Both bulk directions preserve explicit late/excused records and legacy
present records whose first arrival is already classified late. Protected entries
remain view-only badges. Bulk eligibility is computed over editable rows so a
protected late/excused entry does not prevent switching the other rows to absent.

The pre-existing calendar time rule is retained and enforced on the server:
assigned **scheduled, timed sessions can be marked before their end**, including
before they start. Ended, completed, cancelled and untimed/date-only sessions are
read-only. Published reporting time alone does not establish a grading duration.
Database end-time comparisons use actual instants and `clock_timestamp()`, including
after locks/validation and before committing a newly executed save. Read views
continue to display Singapore dates/times.

Only `event_students.attendance_status` is updated. Report text/author, assessment
status/notes, `recorded_at` and `checked_in_at` remain unchanged. Manual marking
does not invent an arrival timestamp. If a present mark has actual stored late
arrival evidence, the saved status is late. The summary RPC still counts only
ended, non-cancelled classes and is not changed by this checkpoint.

### Write contract, conflicts and retries

`saveAttendance` calls `save_instructor_attendance` with an immutable request UUID,
the expected auth-user UUID, target event UUID, student/roster scope, desired
present/absent/null status and an attendance-only snapshot. The snapshot includes
student ID, stored status and both original arrival/recording fields. No report,
assessment or actor-domain identity is accepted as a write field.

The security-definer function checks the actual JWT subject and current
`public.users.role`, derives the linked instructor, and locks the account/link and
assigned event. It rejects missing links, another instructor's event, invalid
requests, non-members and a closed/untimed attendance window. A retained domain
link does not grant permission after demotion. Browser requests cannot select a
different actor by supplying an instructor ID.

It locks/validates every supplied roster row in stable student-ID order before
updating. A bulk request must name the **entire current roster**, including
protected entries; a 100-row slice of a 205-student roster is rejected. Missing or
extra members, duplicate IDs, changed attendance or changed arrival evidence cause
a conflict and roll back the operation. Roster membership changes lock the same
parent event. PostgreSQL deadlock/serialization failures remain whole-transaction
failures and require a reload/retry; tests model stale snapshots/competing intents
in the single-connection offline database rather than claiming a multi-connection
cloud concurrency test.

`instructor_attendance_requests` is a new, private receipt table, with RLS enabled
and browser/anonymous table privileges revoked. It stores request/account/event
identity, normalized attendance-only payload, response and creation time. An exact
retry returns the original receipt without executing updates again, even if a
newer save has since changed attendance. A reused request UUID with different
contents is rejected. Every receipt replay still checks role/link/event ownership;
it cannot bypass demotion or reassignment. An already-committed receipt may be
read after the session closes because replay performs no new attendance write.

Direct instructor REST writes cannot bypass this contract by changing attendance
or arrival fields, inserting pre-marked attendance, deleting recorded attendance,
or moving attendance-bearing records to another composite key. The invoker trigger
distinguishes direct authenticated writes from the trusted security-definer RPC
using PostgreSQL `current_user`, not a client-settable configuration flag.
Administrator/trusted server operations retain their existing behavior; unrelated
report-author protections and roster read policies remain independently enforced.

### Request state and persistence

The existing roster is loaded completely with authoritative event metadata before
enabling controls. Pending submissions keep the recorded state visible, disable
individual/bulk actions and prevent double submission. There are no optimistic
local saves. After server acknowledgement, the hook reloads every roster page and
updates displayed values from that successful read. Rows retain their identity
and the calendar's existing sizing, drawer, focus and responsive layout.

Transport/ambiguous-response failures preserve the same request UUID and snapshot
for Retry save. Conflicts/permission/window errors require Reload attendance before
another intent. If the save is acknowledged but reload fails, the UI says the
attendance was saved and offers only a read retry, avoiding duplicate writes.
Unknown/failed reads do not appear as an empty roster. Account/event/API changes
invalidate old responses and abort obsolete reloads; an old account's result
cannot populate the replacement account. Production attendance data/requests are
not written to browser storage.

### Schema/plan deviations and deployment

The internal durable receipt table is an additive implementation detail needed to
make lost-response retries safe after intervening writes. Existing event/student
domain columns and enums are unchanged. One narrowly scoped attendance write RPC
and REST/membership guards are added; no Edge Function or privileged role/profile
write path is introduced. This checkpoint wires the existing roster UI only.
Phase 10B below now enables report/assessment saves; availability edit/delete and
technique writes remain 10C/10D. QR check-in remains deferred.

Apply `20261105160000_instructor_attendance.sql` (and any earlier outstanding
migrations) before using the enabled frontend saves. The implementation does not
deploy to Supabase Cloud automatically. No Edge Function redeployment is required.

### Verification and rollback

- `npm run build`: passes; existing bundle-size advisory remains.
- Relevant Node/API/offline database/helper checks: 76 passing tests. Database
  checks include persisted commit/new-transaction reads, mark/clear, all 205 roster
  rows, protected states, stale snapshots, exact receipt replay after a newer save,
  role demotion, account/ownership/window denial, direct REST bypass denial and
  preservation of reports/assessments/arrival fields.
- `npm run check:functions`: passes.
- `npm run test:functions`: 5 top-level tests and 16 steps pass.
- Attendance browser suite: 9 passing tests, including pending/double-submit,
  individual/bulk writes, error/lost-response retries, intervening writes, conflict
  reloads, post-save read failure, account isolation, full reload persistence,
  responsive geometry and late/excused preservation.
- Calendar browser suite: 22 passing tests. Its future-session controls assertion
  now expects editable controls; past/untimed sessions remain read-only. Geometry,
  focus/resize, 205-student rosters, calendar states and availability flows pass.

The browser fixture uses real-shaped auth UUIDs and API mutations. Only its
explicit `attendance-persistence` mode writes test-scoped `sessionStorage` to
simulate stored responses across document reloads; production code has no such
fallback. Browser/Node/database tests remain offline and do not verify target
cloud migration history or physical-device behavior.

Rollback disables/reverts the new frontend save path. Revoke authenticated EXECUTE
on `save_instructor_attendance` in a follow-up migration if writes must be stopped.
Keep existing saved attendance, request receipts, authorization/report guards and
read migrations. Do not remove records to roll back a mutation release. Phase 10A
requires approval before implementing 10B.

## Phase 10B: author-owned reports and assessment saves

Implementation: `ReportEditor.tsx`, the existing history/report cards and assessment
form, `use-instructor-session-save.ts`, `use-instructor-write-identity.ts`,
`src/lib/instructor/session-writes.ts`, and the instructor API/decoders.
Migration: `supabase/migrations/20261105170000_instructor_session_saves.sql`.

### Permissions and saved fields

Add report / Edit report now use the original inline textarea and Save/Cancel
layout in student session history. The same editor is reused in grouped class
report cards. Write identity is fetched once per history page from the linked
instructor record; auth-user UUIDs are never substituted for domain author IDs.
An unlinked account retains all-student history reads with report controls
read-only. Identity-read failures have their own retry without becoming a fake
permission grant.

Report creation requires an assigned class enrolment with no report content and
no recorded author. Editing/clearing requires both current class assignment and
ownership of the recorded report. Other authors and non-empty reports with no
known author remain read-only and cannot be claimed. Clearing text writes null
while retaining the original domain author. The server derives that author from
the actual caller's linked instructor row; no requested author ID is accepted.

Reports may be written after a lesson, including completed/past assigned classes.
They are not restricted by attendance's pre-end window. Assigned scheduled and
completed grading-event/student records support assessment status/notes saves,
including date-only gradings and legacy records without an application. Cancelled
classes/gradings are read-only. This does not change target-grade resolution:
targets still come only from actual applications where recorded.

Report operations update only `report` and `report_author_id`. Assessment
operations update only `assessment_status` and `assessment_notes`. Text saves trim
outer whitespace and store null for blank content. Status is pending, completed
or null; selecting the current assessment status again clears it. Notes-only saves
do not invent a pending status. Report fields, attendance/arrival timestamps,
student grade/last-grading dates, applications, sign-offs and event status are not
rewritten by an assessment save. Recorded completed assessments are not promotions
or application approvals; the schema has no assessment-author field to infer.

### Transactional write and read-back contract

`saveReport` / `saveAssessment` invoke the schema-grounded
`save_instructor_session_record` RPC with an immutable request UUID, expected auth
user, exact event/student UUID pair, action kind and only that action's expected
fields/new values. The API verifies the current account/domain identity and checks
the response's request/event/student/action identity, stored values and report
author ID. `getReport` is an assigned-class table read with the actual report-author
join for authoritative read-back; assessment read-back reuses `getAssessment`.

The security-definer RPC locks/checks the current public user role, linked
instructor, assigned event and existing enrolment. It rejects role/link/account
changes, wrong event types and non-candidates; it does not create an enrolment or
borrow another instructor's event. Field-scoped compare-and-set checks reject
changed report text/author or changed assessment status/notes. Unrelated attendance
or report updates do not get overwritten or create a false assessment conflict.

`instructor_session_write_requests` stores private request/user/event/student/kind,
normalized payload, response and creation time. RLS is enabled and browser/
anonymous table privileges are revoked. Exact retries return the committed
receipt without rerunning updates or overwriting newer saves. Different contents,
event/student keys or action kinds cannot reuse a request ID. Current role, link,
event ownership and enrolment are checked before receipt replay; demotion or
reassignment cannot be bypassed. Returning a prior receipt after cancellation
performs no new write.

An invoker trigger prevents direct instructor REST insert/update/delete/re-key
paths from bypassing the report/assessment save contract, including deleting one's
own saved record through roster management. Existing report-author and attendance
guards remain installed and independently enforced. Administrator/trusted server
operations retain their existing behavior. The authorization bypass for the
trusted RPC is PostgreSQL's execution identity, not a client-settable flag.

### Draft, error and resource state

Pending submissions preserve the entered text/status, make draft inputs read-only
and disable repeated saves. No success notice is emitted until the RPC and an
authoritative record reload succeed. Network/lost-response errors keep the same
request UUID, snapshot and values for Retry save. An acknowledged save followed
by a failed read retries only the read.

Conflicts/permission failures offer Reload saved record. Reload updates the
expected snapshot but **keeps the draft**, displays the latest saved content for
comparison and requires an explicit new Save for the retained draft. Inputs stay
locked while a failed request is unresolved, so a frozen retry cannot accidentally
submit different visible text. Report Cancel discards the editor intentionally;
after a failure it reloads the saved record rather than claiming that the server
operation was undone. Assessment status/note state uses functional updates so a
quick status click followed by typing does not reset the chosen status.

Account, role, event/student and API-generation keys fence mutation results and
abort obsolete read-backs. Old-account and old-candidate responses cannot close a
new editor, replace a new draft or emit a save notice in the replacement view.
Production drafts/requests are held in component memory, not browser storage.
Reopening/reloading reads the actual stored rows and report author joins.

### Schema/plan deviations and deployment

The new private receipt table follows 10A's durable retry design and contains
report/assessment text snapshots needed to identify exact requests. Existing domain
columns/enums are unchanged. One narrowly scoped write RPC, the REST guard and a
schema-grounded assigned-report API read are added; no Edge Function, role/profile
write path, promotion processor or application approval action is introduced.
The existing form/card layouts and structured grading review remain in place.

Apply `20261105170000_instructor_session_saves.sql` and earlier outstanding
migrations before using these enabled saves. Cloud deployment is separate from
implementation verification; no Edge Function redeployment is required. Availability
edit/delete remains 10C and technique mutations remain 10D, including the unresolved
per-attempt checklist decision. Each next checkpoint still needs owner approval.

### Verification and rollback

- `npm run build`: passes, with the existing bundle-size advisory.
- Relevant Node/API/offline database/helper suites: 86 passing checks. They cover
  real domain authorship, ownership/unknown-author denial, narrow payloads and
  immutable retries, stale-field conflicts, wrong record/type/role/account denial,
  private receipt ACLs, direct REST bypasses, actual committed report/history reads,
  date-only assessments and preservation of attendance, reports, grades/applications.
- `npm run check:functions`: passes.
- `npm run test:functions`: 5 top-level tests and 16 steps pass.
- Session-save browser suite: 17 passing tests, including report add/edit/clear at
  320/390/768/1440px, ownership/read-only cases, draft retention, pending/duplicate
  suppression, error/receipt retries, conflict/read-back failures, assessment
  status/note changes, persistence and account/candidate isolation.
- Existing reports/assessment read-browser checks: 19 passing tests. Their
  assessment assertions now expect editable controls with a disabled pristine save.
- Existing student-detail browser checks: 23 passing tests.
- Existing attendance save browser checks: 9 passing tests, including protected
  states, receipt retries and reload persistence alongside the new session guards.

The explicit report/assessment persistence fixture modes use test-scoped
`sessionStorage`; production code has no local-save fallback. Offline PostgreSQL
checks verify real commit/new-read persistence. Concurrency tests exercise stale
snapshots and competing intents in the single-connection offline database; they
do not claim multi-connection cloud or physical-device verification.

Rollback disables/reverts the new save controls and API calls. If writes must stop,
revoke authenticated EXECUTE on `save_instructor_session_record` in a follow-up
migration. Preserve saved reports/assessments, private receipts, ownership/REST
guards, attendance writes and read migrations. Do not delete stored records to
roll back this checkpoint. Phase 10B requires approval before implementing 10C.
