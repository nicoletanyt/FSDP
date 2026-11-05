# Instructor data contracts

## Phase 3: read access

Implementation: `src/lib/instructor/api.ts`, `decoders.ts`, and `types.ts`.
Database migration: `supabase/migrations/20261104120000_instructor_reads.sql`.

Use the existing authenticated Supabase client:

```ts
import { supabase } from '@/lib/supabase'
import { createInstructorApi } from '@/lib/instructor/api'

const instructorApi = createInstructorApi(supabase)
```

API operations verify the signed-in account through `users.role`. Member-data
reads require a linked `instructors.user_id`; calendar/availability reads return
empty personal results when the link is absent, and the class catalogue remains
available. Identity is not cached across account changes. UUID event,
student, instructor and auth IDs remain distinct types. Runtime decoders validate
the returned rows and joins; missing records are nullable, failed queries are
errors, and malformed responses never become successful empty lists.

### Reads

| API method | Data source / behavior |
| --- | --- |
| `getCurrentInstructor` | Auth user, own `users` profile, linked `instructors` record |
| `getClassTypes` | Calendar-only class catalogue, without loading grading reference data |
| `getReferenceData` | Centres, grades, tracks, requirements, syllabus and class types; follows all pages even when the server caps responses |
| `getCalendar` | Assigned events overlapping `[from, to)`, subtype data, centre and roster count; empty when unlinked |
| `getEvent` | Assigned event by its UUID; returns null if absent or not assigned |
| `getAvailability` | Own availability dates within `[from, to)`; empty when unlinked |
| `getStudents` | `instructor_student_directory` RPC; literal name/member-number search, grade/colour/centre filters, exact totals and full-scope facets |
| `getStudentDetail` | Student, grade, home centre, primary-first emergency contacts and active medical alerts |
| `getRoster` | Assigned event roster, paginated independently of the calendar |
| `getStudentHistory` | `instructor_student_history` RPC; history across instructors/dojos, including event/instructor/report-author identities |
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

- Existing teaching relationships determine which students are visible. A visible
  student's full history spans all instructors and dojos; unrelated students and
  their roster rows remain inaccessible.
- A domain link alone does not confer instructor permissions after role demotion.
- Broader history SELECT access does not broaden event/attendance write access.
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
prerequisite. Readiness evaluation and assessment checklist wiring follow in
the grading phase. The current schema cannot scope technique sign-offs to
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
fallback. Student-detail destinations are wired in the later student-detail phase.

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
