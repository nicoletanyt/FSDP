# Instructor responsive browser checks

These tests use Node's test runner and Firefox through WebDriver. They render the
real calendar, student directory/details and instructor layout through a separate, deterministic fixture;
no Supabase account or backend writes are needed. The fixture is not part of the
production Vite entry point.

The fixture injects the API from `instructor-api.fixture.ts` through the production
data context. Its clock represents 09:00 Singapore time. Directory responses come
from `instructor-directory.fixture.ts` and use database-shaped rows and UUIDs.
Student profiles/history/attendance use database-shaped records from
`instructor-detail.fixture.ts`; directory/detail geometry checks follow real UUID
links through the same production API context.

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
```

Use `FSDP_BASE_URL` and `WEBDRIVER_URL` if those services run elsewhere. The
WebDriver service must be free to create a new session. Run the suites
sequentially when sharing a driver.

The suite checks 320–430px views, role-based left Sheet navigation, the calendar view popover beside month/year,
24px instructor main padding, 16px overlay padding, single-line roster alignment, measured touch-target sizes and spacing,
sticky-header clearance in short landscapes, single-day/two-day timeline positioning,
second-day class/availability actions, the simplified List header, week paging, synthetic
day-swipe handlers, Today, UUID drawer/history/focus, recorded attendance and read-only controls,
availability creation/read-only existing slots, resizing, and short-landscape bounds. Header controls retain
44px targets; the existing seven-column day grids are checked against their
viewport-relative geometry, including Firefox's reserved scrollbar on narrow frames. Iframes
provide exact CSS widths below Firefox's minimum headless window size. These
checks do not replace physical iPhone/Android testing for native scrolling,
gestures, the virtual keyboard, or date/time pickers.

Data-flow checks cover loading, empty results, calendar/roster failure and retry,
205-student roster pagination, the yellow Late badge, stale responses after date
navigation, and account changes while a selection is open. The calendar follow-up
also checks unlinked-account calendars, pending availability saves, double-submit
protection, failed-save draft retention and read-after-save refresh. Attendance
and existing-slot edit/delete mutations remain disabled.

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
global attendance filters/date ordering, separate teacher/report-author identities,
unknown authors, independent complete attendance aggregates, loading/error/retry
and successful-empty states, unlinked/expired-student access, disabled report
writes, account isolation and late responses after switching students.

Phase 7 grading records are injected from `instructor-grading.fixture.ts` through
the same production API context. Checks cover database grade/rule/syllabus IDs,
readiness with zero technique sign-offs, actual/unknown signers, pending/completed
recorded assessments and notes, 205-assessment pagination, missing rules/terminal
grades, retry/loading-modal behavior and account isolation. Grading adapts the
original structured cards: grade/status badges, readiness progress, requirement
rows with actual/required values, separate assessment entries and the responsive
review dialog with category accordions and read-only technique checkboxes. Tests
check row containment, dialog bounds and completion/close behavior at 320–1440px.
The profile loading/empty-period assertions use the current loading modal and
reporting-period popover.

Calendar fixtures also provide date-only grading modes with released/unreleased
reporting times. Existing month cards and selection drawers must show their date
and honest time label, retain null event timestamps and avoid invalid geometry or
fabricated hourly blocks. The calendar suite continues to cover all prior timed
event and availability behaviors.

Known data-only-phase limitation: at 1024px and 200% root text, the existing
student-page navbar's `calc(92% + 3rem)` width exceeds the usable viewport. The
directory row contents remain contained; the suite reports the page overflow
rather than weakening that assertion or changing application styling.
