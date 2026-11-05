# Instructor responsive browser checks

These tests use Node's test runner and Firefox through WebDriver. They render the
real calendar, student directory/details and instructor layout through a separate, deterministic fixture;
no Supabase account or backend writes are needed. The fixture is not part of the
production Vite entry point.

The calendar fixture injects the read API from `instructor-api.fixture.ts` through
the production data context. Its clock represents 09:00 Singapore time. Other
pages retain their existing fixtures until their own wiring phases.

Start the following in separate terminals:

```sh
npm run dev -- --host 127.0.0.1
geckodriver --port 4444
```

Then run:

```sh
node --test tests/mobile-responsive/calendar.test.mjs
node --test tests/mobile-responsive/students.test.mjs
```

Use `FSDP_BASE_URL` and `WEBDRIVER_URL` if those services run elsewhere. The
WebDriver service must be free to create a new session. Run the suites
sequentially when sharing a driver.

The suite checks 320–430px views, role-based left Sheet navigation, the calendar view popover beside month/year,
24px instructor main padding, 16px overlay padding, single-line roster alignment, measured touch-target sizes and spacing,
sticky-header clearance in short landscapes, single-day/two-day timeline positioning,
second-day class/availability actions, the simplified List header, week paging, synthetic
day-swipe handlers, Today, UUID drawer/history/focus, recorded attendance and read-only controls,
read-only availability, resizing, and short-landscape bounds. Header controls retain
44px targets; the existing seven-column day grids are checked against their
viewport-relative geometry, including Firefox's reserved scrollbar on narrow frames. Iframes
provide exact CSS widths below Firefox's minimum headless window size. These
checks do not replace physical iPhone/Android testing for native scrolling,
gestures, the virtual keyboard, or date/time pickers.

Data-flow checks cover loading, empty results, calendar/roster failure and retry,
205-student roster pagination, the yellow Late badge, stale responses after date
navigation, and account changes while a selection is open. Mutations are disabled
during this read-wiring phase; no local demo save is treated as a backend save.

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
