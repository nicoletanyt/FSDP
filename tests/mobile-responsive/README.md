# Instructor calendar browser checks

These tests use Node's test runner and Firefox through WebDriver. They render the
real calendar and instructor layout through a separate, deterministic fixture;
no Supabase account or backend writes are needed. The fixture is not part of the
production Vite entry point.

Start the following in separate terminals:

```sh
npm run dev -- --host 127.0.0.1
geckodriver --port 4444
```

Then run:

```sh
node --test tests/mobile-responsive/calendar.test.mjs
```

Use `FSDP_BASE_URL` and `WEBDRIVER_URL` if those services run elsewhere. The
WebDriver service must be free to create a new session.

The suite checks 320–430px views, role-based left Sheet navigation, the calendar view popover beside month/year,
16px page/overlay padding, single-line roster alignment, measured touch-target sizes and spacing,
sticky-header clearance in short landscapes, single-day/two-day timeline positioning,
second-day class/availability actions, the simplified List header, week paging, synthetic
day-swipe handlers, Today, drawer/history/focus, attendance and read-only rules,
availability validation/editing, resizing, and short-landscape bounds. Iframes
provide exact CSS widths below Firefox's minimum headless window size. These
checks do not replace physical iPhone/Android testing for native scrolling,
gestures, the virtual keyboard, or date/time pickers.
