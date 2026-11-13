# Instructor responsive browser checks

These tests use Node's test runner and Firefox through WebDriver. They render the
real calendar, student directory/details, assessment pages and instructor layout through a separate, deterministic fixture;
no Supabase account or backend writes are needed. The fixture is not part of the
production Vite entry point.

The fixture injects the API from `instructor-api.fixture.ts` through the production
data context. Its clock represents 09:00 Singapore time. Directory responses come
from `instructor-directory.fixture.ts` and use database-shaped rows and UUIDs.
The fixture provides an in-memory QueryClient and disables speculative prefetch
with the data-saver setting so request/failure scenarios remain deterministic.
Student profiles/history/attendance use database-shaped records from
`instructor-detail.fixture.ts`; directory/detail geometry checks follow real UUID
links through the same production API context.

The profile suite covers saved address/employment values, the Address pencil icon
and edit dialog at 320–1440px, save/cancel/clear, Escape/focus return, draft retention on failure, duplicate-save
protection, device photo preparation/upload/removal, account-avatar updates,
reload persistence and account switching during saves. Its test-only profile API
uses sessionStorage to simulate the database; production uses the Supabase RPCs
and private Storage bucket, covered separately by `tests/instructor-profile.test.mjs`
and `tests/instructor-profile-db.test.mjs`.

Start the following in separate terminals:

```sh
npm run dev -- --host 127.0.0.1
geckodriver --port 4444
```

Then run:

```sh
node --test tests/mobile-responsive/calendar.test.mjs
node --test tests/mobile-responsive/students.test.mjs
node --test tests/mobile-responsive/student-details.test.mjs
node --test tests/mobile-responsive/student-training-dialog.test.mjs
node --test tests/mobile-responsive/session-reads.test.mjs
node --test tests/mobile-responsive/grading-page.test.mjs
node --test tests/mobile-responsive/attendance.test.mjs
node --test tests/mobile-responsive/profile.test.mjs
node --test tests/mobile-responsive/session-saves.test.mjs
node --test tests/mobile-responsive/chatbot.test.mjs
node --test tests/mobile-responsive/nfc.test.mjs
```

Use `FSDP_BASE_URL` and `WEBDRIVER_URL` if those services run elsewhere. The
WebDriver service must be free to create a new session. Run the suites
sequentially when sharing a driver.

`grading-payment.html` mounts the student grading payment page with a fixed
profile and a stubbed `record_grading_payment` RPC for manual responsive/state
checks (idle, processing, success, sync failure). Use `?rpc=fail` or
`?rpc=slow` to exercise the failure and saving states. It never contacts
Supabase or charges a card.

Add `?appRoute=%2Fgrading` to check the actual app route, student navigation,
protected gate and layout using the fixture account. The Grading tab now opens
the payment page directly; the opportunity list remains at `/grading/applications`.

`grading-payment.test.mjs` uses installed headless Chrome over CDP (no browser
package required). Start Vite on port 5180, then run
`node --test tests/mobile-responsive/grading-payment.test.mjs`. Override
`FSDP_BASE_URL` and `CHROME_PATH` as needed. It checks 320–1440px routes,
all three methods, per-grade totals, S$22 late fees, demo-only receipts,
application-context saving and sync failure. Fixture options: `?grade=4-dan`,
`?deadline=2020-01-01`, and `?application=1` (stubbed application write).
Without `application=1`, previews must never write to the database.

The NFC suite simulates Android Chrome 89+, tablets, Edge, missing Web NFC,
old Chrome, iPhones and insecure contexts without using real NFC hardware or
calling Supabase. It checks ready/QR-only states, the compatible-device list,
QR navigation, layout at 320–1280px, and that unsupported devices never submit
captured tags. Physical NFC hardware and whether it is enabled cannot be reliably
detected without starting a scan; production checks Android, Web NFC API exposure
and a secure context before displaying readiness.

The grading-page suite covers per-instructor batch drafts, a complete persisted
student/technique matrix, automatic resume after reload, editable signed submissions, account
isolation, version conflicts and exact-request retries after lost responses.
Only `batch-persistence` mode uses test-scoped session storage. Production batch
data and signatures are saved through the database RPCs, never browser storage.
`tests/instructor-grading-batches-db.test.mjs` applies the batch migration to an
offline PostgreSQL instance and checks constraints, RLS, atomicity and unchanged
student grades/legacy assessments. Draft and submitted checklists can be edited;
resubmission requires a new signature and each prior signed receipt is retained.
Timestamp checks verify "Last saved" / "Last submitted" appears below the table.

The chatbot suite opts into `fixtureChat=true`, mocks the existing Supabase
session/function methods in the fixture only, and never contacts OpenRouter or writes
database records. It covers instructor-only visibility, send/retry/hidden sources,
Escape/focus return, stop/clear, late replies after account switches, and panel
bounds at 320px, 390px, short landscape and desktop sizes.
It also verifies suggested topics, follow-up prompts, native keyboard activation,
pending/error visibility, draft retention, duplicate-click protection and
scroll-reachable 44px topic buttons.
The student-style question-chip checks also verify full-question labels, primary
outlined styling, placement directly beneath the greeting/latest assistant reply and
before its timestamp, hiding stale suggestions, and keeping the local greeting
out of model requests.
Markdown checks cover emphasis/lists, literal user messages, blocked raw HTML,
images and model links, horizontally scrollable tables and hidden source links.
Expand/minimize tests cover modal bounds and focus trapping/return, native Escape,
single-instance message logs, and draft/pending-reply preservation.

The suite checks 320–430px views, role-based left Sheet navigation, the calendar view popover beside month/year,
24px instructor main padding, 16px overlay padding, single-line roster alignment, measured touch-target sizes and spacing,
sticky-header clearance in short landscapes, single-day/two-day timeline positioning,
second-day class/availability actions, the simplified List header, week paging, synthetic
day-swipe handlers, Today, UUID drawer/history/focus, recorded attendance and read-only controls,
availability creation/editing/confirmed deletion, resizing, and short-landscape bounds. Header controls retain
44px targets; the existing seven-column day grids are checked against their
viewport-relative geometry, including Firefox's reserved scrollbar on narrow frames. Iframes
provide exact CSS widths below Firefox's minimum headless window size. These
checks do not replace physical iPhone/Android testing for native scrolling,
gestures, the virtual keyboard, or date/time pickers.

Data-flow checks cover loading, empty results, calendar/roster failure and retry,
205-student roster pagination, the yellow Late badge, stale responses after date
navigation, and account changes while a selection is open. The calendar follow-up
also checks full-time/unspecified/unlinked accounts have no availability controls,
records or reads, part-time availability access, pending availability saves, double-submit
protection, failed-save draft retention and read-after-save refresh. Existing-slot
availability checks cover edit/delete persistence across reload at 320/390/1280px,
deletion confirmation/cancellation, exact-request retries after lost update/delete
responses, and conflict reload without losing the draft. Production mutations use
the Supabase RPC; only `availability-persistence` fixture mode uses session storage.
`tests/instructor-availability.test.mjs` validates API payloads/receipts and
`tests/instructor-availability-access-db.test.mjs` verifies authorization, snapshots,
retries and overlap/time rules against offline PostgreSQL. Phase 10A enables the
existing present/absent/clear and bulk controls for scheduled timed sessions before
their end. Past/completed/cancelled/untimed sessions and late/excused entries stay
read-only.

The directory suite checks:

- No horizontal overflow at 320/390/640/768/1024/1280/1440px, a same-row search and
  Filter toolbar at every width and 44px mobile control targets. Directory and
  detail pages share 24px main padding below `lg`, and 92% width capped at 1200px
  with 32px vertical padding at `lg` and above. Cross-route geometry checks also
  compare navigation bounds, 16px card insets and section spacing.
- Directory rows use 16px horizontal and 12px vertical padding. Top-level gaps
  match detail's 8px mobile / 24px desktop rhythm, result-count-to-card spacing is
  16px, and filter popovers use 16px insets, 12px group gaps and 6px field gaps.
- Exact 320/390px typography: 24px heading, 16px/24px controls and student names,
  14px/20px metadata, 12px/16px badges and 12px labels. The first list row starts
  above 300px. Desktop font sizes are checked at 768/1440px.
- The name/badge alignment, grading-track metadata below the name, long identity/dojo
  labels and 200% root text enlargement without clipping. Names and badges can
  reflow onto separate lines at enlarged text sizes. Text enlargement is not
  native browser or pinch zoom. Enlarged-text checks also cover the empty-state
  action, result-count/Clear all wrapping and scroll-reachable popover actions.
- One controlled filter popover at all widths, opened before the custom Rank,
  Belt and Dojo menus. Changes apply live, preserve search and unrelated URL
  parameters, update counts and leave the popover open. The trigger's active
  count excludes search. Reset filters is disabled with no selected filters;
  resetting clears only rank/belt/dojo and keeps search and the popover open.
- Clear all beside the result count and Clear search and filters in the empty
  state, including URL cleanup, restored search focus and result counts.
- Deep-linked filters, a single popup/control set across resizing, student-detail
  navigation and browser Back.
- Complete-snapshot totals and full-scope facets, 50-row local pagination over
  205 entries, page recovery, real UUID links, Unranked, loading/empty/error/retry,
  local search and account changes. Request logging verifies that search, all
  filters and visible pagination do not call the API after initial loading.
  URL filters use grade IDs, raw colour values
  and centre UUIDs while retaining human-readable option labels.
- Initial loading follows unfiltered backend pages; a failed later page never
  appears as a partially cached directory. Retry starts a new complete load and
  retains the selected URL criteria.
- All-student reads include another dojo and a student without enrolment and with
  expired membership. Unlinked instructor accounts see the same global directory.
- Popover and all three nested menu bounds at 320×568, 568×320 and 844×390,
  long-label wrapping, last-option scrolling and a footer reachable by scrolling
  the popover on short landscapes.
- Native WebDriver Tab/Enter opening from search to Filter, Rank focus and
  Enter/ArrowDown/Enter selection of 10th Kyu; nested Escape closes the menu before
  the parent popover. Tab reaches Done, which returns focus to Filter. A native
  outside pointer click also dismisses the popover with focus return. Enter
  activates a student link.

Long-content stress checks replace rendered text only; they do not alter
production records or backend behavior.

The student-detail suite checks responsive profiles and dialogs at 320–1440px,
stored contacts and active medical alerts, missing optional records, real UUID
deep links and calendar/roster context navigation, 205-session history pagination,
global attendance filters/date ordering, class instructor identities,
independent complete attendance aggregates, loading/error/retry
and successful-empty states, unlinked/expired-student access,
account isolation and late responses after switching students. Session history no
longer includes instructor reports or report editing controls. A read-only technique
checklist appears in Overview below Next grading, using the stored syllabus/sign-offs;
checks cover responsive layout, category toggles, progress and loading/error/empty states.

Phase 7 grading records are injected from `instructor-grading.fixture.ts` through
the same production API context. Checks cover database grade/rule/syllabus IDs,
readiness with zero technique sign-offs, actual/unknown signers, pending/completed
recorded assessments and notes, 205-assessment pagination, missing rules/terminal
grades, retry/inline-loading-skeleton behavior and account isolation. Grading adapts the
original structured cards: grade/status badges, readiness progress, requirement
rows with actual/required values and separate assessment entries. Overview contains
category accordions and read-only technique checkboxes; the Grading tab has no
Review grading action or modal. Tests check containment, tab placement and
category toggles at 320–1440px.
Profile loading checks cover inline skeletons and a fresh directory-backed identity
preview without inventing emergency contacts or medical alerts; empty-period
assertions use the reporting-period popover.

The student-training-dialog suite checks training-class speech bubbles opening a
modal without changing the calendar route, selected class or attendance roster.
It reuses the profile sidebar's information/contact/medical components and the
Overview technique checklist. Tests cover 320–1280px layouts, nested contact and
medical dialogs, read-only sign-offs, lazy loading and shared profile caching,
loading/error/retry/missing states, Escape/focus return, student changes and
account isolation. The centered modal is capped at 80% of viewport height; only
the technique checklist scrolls, with student information and Close staying fixed.
Short-screen layouts compact the student information to preserve checklist space.
Grading-roster assessment links remain covered by session reads.

Calendar fixtures also provide date-only grading modes with released/unreleased
reporting times. Existing month cards and selection drawers must show their date
and honest time label, retain null event timestamps and avoid invalid geometry or
fabricated hourly blocks. The calendar suite continues to cover all prior timed
event and availability behaviors.

The Phase 8 `session-reads.test.mjs` suite uses `instructor-session.fixture.ts`
through the same API provider. It covers:

- Existing assessment-form layouts at 320/390/768/1440px.
- Legacy report URLs redirecting to the calendar without report controls.
- Canonical/legacy event/student UUID keys, wrong event types/candidates, malformed
  keys, missing applications and unknown target-grade joins.
- Recorded pending/completed/null status, actual notes and application targets.
  Phase 10B makes authorized controls editable, with pristine saves disabled and
  cancelled/unauthorized records remaining read-only; no demo-success message.
- Date-only grading dates, loading skeletons, permission/error/retry states, account
  changes and late responses after switching class/candidate.
- The existing grading-roster action opening the matching assessment and its
  student-profile link preserving event/student/date/tab context.

The Phase 10A `attendance.test.mjs` suite covers individual mark/clear actions,
bulk requests containing all 205 roster snapshots, preserved late/excused entries,
optimistic individual rows with row-local toggle locks, retained roster nodes through
save/refresh, initial-load skeletons, saved/failed labels and queued edits to other
rows. Bulk saves remain non-optimistic. Recovery checks cover frozen request IDs
on network/lost-response retries, intervening
writes, conflicts requiring reload, post-save read failures, newly read-only
session metadata, account changes during saves, drawer/resize behavior and full
document reload persistence.

`tests/instructor-attendance-coordination.test.mjs` additionally checks two mounted
views sharing the QueryClient-backed overlay, per-event serialization/coalescing,
failure barriers, explicit offline retry and generation-fenced late completions.
`tests/instructor-class-cache.test.mjs` covers reconciliation after the last view
unmounts and background refresh errors. Failed event queues discard unsent intents;
the user must reapply them after retry/reload recovery, never silently replay them.

The fixture auth accounts use distinct real-shaped UUIDs. Its attendance API keeps
stored row snapshots and request receipts in the test provider. Only the explicit
`attendance-persistence` fixture mode writes test-scoped `sessionStorage` to retain
fixture records across a document reload. No production attendance data or save
request is written to browser storage. Offline SQL tests separately verify a real
committed save followed by a new authenticated read transaction.

`session-saves.test.mjs` injects `instructor-session-writes.fixture.ts`.
It checks assessment status/notes and null clearing, pending drafts/double submits,
lost-response receipts, draft-preserving conflict reloads, post-save read failures,
account/candidate changes during saves and persistence across document reloads.
Obsolete report-editor tests were removed along with the report feature; the read
suite verifies that legacy report links redirect to the calendar.
The structured-grading suite remains a regression check for grading review.

`tests/instructor-db.test.mjs` exercises the historical migration behavior before
applying `20261107031006_remove_instructor_reports.sql`. Its final regression
verifies that report columns/RPCs are removed, all other roster fields and technique
sign-offs are preserved, history still decodes, and assessment/attendance writes work.

Only explicit persistence test modes keep
fixture row overrides in test-scoped `sessionStorage`. Production drafts and save
requests stay in component memory, with authoritative Supabase reads after saves.

Known data-only-phase limitation: at 1024px and 200% root text, the existing
student-page navbar's `calc(92% + 3rem)` width exceeds the usable viewport. The
directory row contents remain contained; the suite reports the page overflow
rather than weakening that assertion or changing application styling.
