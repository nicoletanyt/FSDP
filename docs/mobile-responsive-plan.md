# Mobile responsiveness implementation plan

## Purpose and scope

Review date: 2 November 2026. This is an implementation backlog based on the current React source, not a record of implemented or browser-verified fixes. All implementation checkboxes intentionally start unchecked.

**Goal:** make every existing route and workflow usable from **320 CSS pixels upwards**, while preserving the existing desktop appearance, routes, data, and behavior. Use responsive Tailwind CSS and the project's existing Shadcn/Base UI components. Keep changes local to presentation and the minimum client-side interaction handling needed for responsive navigation and overlays.

### Scope boundaries

- Preserve the existing desktop typography, brand tokens, light/dark themes, calendar modes, form validation, and account workflows.
- Do not change Supabase integration, authentication/role rules, backend logic, Edge Functions, database schemas, payment processing, or API contracts.
- Treat `src/lib/`, authentication provider/hooks, and QR camera/validation helpers as existing contracts to consume. Responsive work should not require modifications to them.
- Preserve current demo persistence: session attendance/reports/assessments use the in-memory map in `src/lib/instructor-calendar.ts`; availability and check-in records live in page state; technique sign-offs, examiner signatures, and instructor photos use browser storage. Responsive presentation must not reset or migrate these records.
- Do not add student booking, student QR generation, payment initiation, administrator management tables, or other workflows that are absent from the UI.
- Avoid broad component rewrites, new layout libraries, a Tailwind migration, or extracting large page internals solely to reorganize code. Small presentational helpers are appropriate when needed to avoid divergent mobile/desktop behavior.

## 1. Codebase inventory

### Stack and shared structure

- React 19, TypeScript, React Router, Vite, Tailwind CSS v4; `src/main.tsx` mounts `App` inside `AuthProvider`.
- Routes are declared in `src/App.tsx`; lazy page loading and role redirects are handled by `src/components/auth/AuthGate.tsx` and layout `Suspense` boundaries.
- `components.json` selects Shadcn `base-nova`. Existing UI wrappers use **`@base-ui/react`**, not Radix. Preserve the existing `render`, `nativeButton`, focus, and controlled-open APIs.
- `src/index.css` defines a custom type scale: `text-base` is **20px**, `text-sm` is **17.5px**, and `text-xs` is **15px** at the normal root size. Explicit `text-[10px]`/`text-[11px]` and some `text-2xs` controls are much smaller. Do not assume Tailwind's default font sizes when making mobile decisions.
- `index.html` already has a normal responsive viewport meta tag. No Tailwind breakpoint overrides are present in `src/index.css`; use standard `sm` 640px, `md` 768px, `lg` 1024px, and `xl` 1280px boundaries unless a measured fit issue requires a local adjustment.
- `FloatingChatbot` is rendered outside `Routes`, so it appears on public, student, administrator, and instructor screens. The existing kiosk selector in `src/index.css` hides it during check-in kiosk mode.

### Route coverage and implementation ownership

| Existing route | Page / routing behavior | Layout and relevant dependencies | Phase |
| --- | --- | --- | --- |
| `/` | Redirects to `/instructor` | `src/App.tsx`, role-aware index redirect | 1, 6 |
| `/login` | Student `Login` | `RootLayout` → `AuthGate` → `AuthLayout` | 1, 4 |
| `/signup` | `Signup` with `AccountFields` | `RootLayout` → `AuthGate` → `AuthLayout` | 1, 4 |
| `/staff/login` | `Login staff` for instructor/administrator | `RootLayout` → `AuthGate` → `AuthLayout` | 1, 4, 5 |
| `/instructor` | `InstructorIndexRedirect`; preserves the search string for an authenticated instructor | Root instructor branch; no instructor navigation at this point | 1, 6 |
| `/instructor/signin` | The same `Login staff` component | Root instructor branch → `AuthGate` → `AuthLayout`; **no normal Root header/main/footer** | 1, 4 |
| `/dashboard` | `StudentDashboard` → shared `Dashboard`; account details only | `RootLayout`, student guard | 1, 4 |
| `/instructor/dashboard`, `/instructor/calendar` | Both render `InstructorDashboard` | `InstructorLayout`, `InstructorNavigation`, calendar components | 1, 2 |
| `/instructor/check-in` | `InstructorCheckIn` | `InstructorLayout`, `CheckInScanner`, `useQrCamera`; normal and kiosk modes | 1, 2 |
| `/instructor/students` | `InstructorStudents` directory | `InstructorLayout`, grade badges, dropdown filters | 1, 3 |
| `/instructor/students/:studentId` | `InstructorStudentDetails`; overview, sessions, grading tabs | `StudentSessionHistory`, grading review dialog/signature pad, toast provider | 1, 3 |
| `/instructor/reports/:eventId` | `InstructorStudentReports` | Instructor shell; links back to calendar and student sessions | 1, 3 |
| `/instructor/assessments/:assessmentId` | `InstructorGradingAssessment`; composite event/student identifier | Instructor shell | 1, 3 |
| `/instructor/assessments/:eventId/:studentId` | Same assessment page, alternate route parameters | Instructor shell | 1, 3 |
| `/instructor/profile` | `InstructorProfile`; photo, password change, sign out | Instructor shell, shared password/dialog/avatar primitives | 1, 3 |
| `/admin` | `AdminDashboard` → shared `Dashboard` + `CreateInstructorForm` | `RootLayout`, administrator guard, shared `AccountFields` | 1, 5 |
| `/checkout/success`, `/checkout/cancel` | `CheckoutSuccess`, `CheckoutCancel`; informational return pages | `RootLayout` | 1, 4 |
| `*` | `NotFound` | Root's pathname-dependent shell; test unknown instructor paths too | 1, 4, 6 |

### Reusable component coverage

| Files | Current usage / review result | Implementation ownership |
| --- | --- | --- |
| `src/layouts/RootLayout.tsx`, `src/layouts/InstructorLayout.tsx`, `src/layouts/AuthLayout.tsx` | Page widths, header, footer, route loading and viewport-height policies | Phase 1 |
| `src/components/instructor/InstructorNavigation.tsx`, `src/components/theme-toggle.tsx` | Instructor links, profile entry, theme switching | Phase 1 |
| `src/components/FloatingChatbot.tsx`, `src/components/ui/scroll-area.tsx` | Already viewport-sized chat with safe-area bottom offset, wrapping messages and an internal message viewport | Phase 1; device verification in 6 |
| `src/components/ui/button.tsx`, `input.tsx`, `password-input.tsx`, `textarea.tsx`, `label.tsx` | Form controls and action sizing; several variants are below comfortable touch size | Phase 1 contract; route-specific overrides in 2–5 |
| `src/components/ui/dialog.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `toast.tsx` | Shared overlay sizing, focus and notification placement | Phase 1 contract; complex dialog bodies in 2–3 |
| `src/components/ui/tabs.tsx`, `avatar.tsx`, `src/components/GradeBadge.tsx` | Profile tabs, instructor identity and grade summaries | Phase 1 contract; usage refinements in 2–3 |
| `src/components/ui/card.tsx`, `alert.tsx`, `kbd.tsx` | Mostly usable foundations; inspect content shrink/wrap and focus clipping rather than blanket restyling. Shortcut hints are supplemental. | Phase 1 review, affected consumers in later phases |
| `src/components/auth/Dashboard.tsx`, `AccountFields.tsx` | Shared student/administrator account panel and signup/instructor creation fields | Phase 4 owns shared markup after Phase 1; Phase 5 consumes it |
| `src/components/auth/AuthGate.tsx`, `AuthProvider.tsx` | Gate has loading/error/retry UI; provider has no responsive UI | Gate presentation in Phase 1; provider behavior preserved |
| `src/components/instructor/CalendarTimeline.tsx`, `CalendarAvailability.tsx`, `ClassSessionDetails.tsx`, `SelectedClassIndicator.tsx` | Timeline, availability editing, roster/attendance, selection marker | Phase 2 |
| `src/components/instructor/CheckInScanner.tsx` | Camera settings and full-area feedback overlays | Phase 2 |
| `src/components/instructor/StudentSessionHistory.tsx` | Attendance/date filters, session cards, inline report editor | Phase 3 |

Paths abbreviated to filenames in the UI row above are all under `src/components/ui/`.

**Actual complexity:** no rendered HTML data tables or shared table component were found in the current pages/components. The directory, rosters, check-in history, reports and grading history are lists/cards; the calendar uses CSS grids. Adapt those structures directly. There is only one student dashboard and one administrator dashboard, not separate student scheduling or administrator management sections.

## 2. Responsiveness findings

These are source-backed problems or risks to verify against a browser baseline, rather than claims that every item was reproduced on a physical device.

| Priority | Observed implementation | Mobile consequence / required response |
| --- | --- | --- |
| High | Root main/error/loading widths use `w-[70%]`; ordinary instructor pages also use `w-[70%]`. Instructor navigation defaults to `w-[80%]`. | At 320px, ordinary content is only 224px before card padding. Introduce full available mobile width with deliberate gutters; restore current percentage widths at desktop boundaries. |
| High | Root navigation is a single `flex` row with logo/brand, theme toggle, auth links or Dashboard/Sign out, `px-6`, `gap-4`. | Items compete for too little space, particularly with 20px base type. Use a two-row mobile header with an accessible account menu. |
| High | Root returns only `Suspense`/`Outlet` for **every** `/instructor/*` pathname. | `/instructor/signin`, instructor gate states, and unknown instructor routes cannot rely on the normal Root container. Give them explicit mobile gutters without changing routing or duplicating authenticated navigation. |
| High | Calendar instructor shell uses `h-dvh overflow-hidden` at every width; headers/toolbars wrap and consume a variable amount of vertical space. | Short/landscape screens can leave a tiny or inaccessible calendar. Use normal mobile page flow, keeping desktop viewport behavior behind its breakpoint. |
| High | A selected class creates `grid-rows-[repeat(2,minmax(320px,1fr))]` below `lg`; both calendar and roster have their own scrolling. | Selected details create an outer scroll region around inner scroll regions. Use a mobile detail dialog with a single body scroller rather than two stacked dashboard panes. |
| High | Timeline sets inline minimum widths of 910px for week and 300px for day, with a 64px time gutter; half-hour slots are 36px high. | Even day mode can overflow a 288px mobile content area. Render a selected-day timeline on narrow screens, size it to available width, and keep availability entry accessible without drag. |
| High | Month view always renders seven columns, 144px minimum rows, individually scrollable day cells, 24px date buttons, and truncated 11px event labels. | Tiny targets, hidden event information and nested scrolling. Provide a mobile month agenda; keep the desktop month grid. |
| High | `ClassSessionDetails` uses fixed `h-14` rows, a 92px action column, 28px attendance/note buttons, and truncated names with `title`. | Names and actions become cramped; hover/title cannot be the only way to identify a student. Stack/wrap mobile roster rows and enlarge targets. |
| High | New Grading uses `max-h-[85vh]`, large `px-8` header/body/footer padding and a fixed header/footer around a long checklist/signature body. Its close-confirmation dialog is nested. | Small/short viewports can lose working space or actions. Use mobile viewport-aware sizing, compact padding and one scrolling body while preserving confirmation/focus behavior. |
| Medium | Student information sidebar is `order-2` on mobile, after all tab content, while tabs appear first. | Student identity, medical and emergency information may be far below a long history. Put identity and important alerts before the working tabs on mobile. |
| Medium | Student and grading summaries use unconditional two-column grids; assessment status and report action rows include non-wrapping controls. | At 320px long rank labels, headings and action text can collide. Stack the narrowest summaries and wrap actions. |
| Medium | Check-in has useful mobile stacking and kiosk safe-area offsets already, but scanner uses `min-h-112`, recent list uses `max-h-64`, feedback is absolutely positioned, and camera select allows `max-w-[320px]` inside a padded popup. | Camera options can exceed the scanner width; landscape/error/feedback states need height-aware layout and an always-visible kiosk exit. |
| Medium | Shared inputs are 32px high; tabs list is 32px; buttons default to 40px and small/icon variants are smaller; password reveal uses `xs`. | Add mobile touch sizing at the correct consumer or narrowly scoped primitive variant, restoring existing desktop sizes. |
| Medium | Generic dialogs have no default height limit; dropdowns have width caps but no explicit height/scroll limit; calendar legend has a fixed `9.5rem` text column inside a viewport-capped popup. | Content can extend off a short screen or collide inside an otherwise correctly capped overlay. Constrain overlay heights and reflow internal content. |
| Medium | Chatbot and toast viewport both occupy the bottom-right; chatbot is `z-40`, dialogs/toasts `z-50`; toast has no safe-area bottom offset. | Notifications, fixed launchers and page actions need a shared collision/clearance policy. Chat keyboard behavior needs real-device validation. |
| Medium | Headings commonly use custom `text-3xl` (37.5px); reports/alerts/created-account email do not consistently break long tokens. Cards default to `overflow-hidden`. | Long titles, names, URLs and feedback can clip. Use mobile heading sizes and targeted shrink/wrap rules, without hiding overflow at page level. |

## 3. Shared implementation contract

Every phase implements against these decisions. Record any necessary deviation here before dependent work starts.

- **Desktop preservation:** use mobile-first classes with explicit larger-screen restoration. `lg` is the default boundary for the instructor desktop navigation, calendar grid/panel, and percentage page widths. Keep existing `sm`/`md` card/form layouts where they genuinely fit; adjust an individual grid only when its available width is insufficient. Compare 1024px, 1280px and 1440px baselines, not just a wide monitor.
- **Mobile containers:** normal main content uses `p-4` (16px on every side), as do simple dialogs, sheets, popovers and the content regions of complex overlays. Avoid cumulative shell + auth-layout horizontal gutters and duplicate outer/body padding in drawers. At 320px the page has about 288px of usable width. Chat-launcher clearance is a separate spacer after main content. Keep calendar/station desktop max-widths of 1600px/1440px and existing desktop proportions.
- **Scrolling:** the mobile document is the normal page scroller. Dialogs have one constrained body scroller, with reachable header/close/footer controls. The timeline and chat message log may each have one deliberate bounded viewport. Remove redundant parent/child vertical scrolling; retain the existing desktop calendar panes. Do not fix defects with global `overflow-x-hidden` or by clipping cards.
- **Mobile site navigation and calendar controls:** a compact sticky brand/Menu navbar opens a left-side Shadcn-style Sheet containing role links, account information, active-page markers and theme controls. Calendar controls are a separate, non-sticky page header with a Day/Week/Month/List popover to the right of month/year. Week retains the existing two-day mobile renderer and `view=week` URL; Day shows one day. Both have a swipeable week strip. Month uses a compact indicator grid and selected-day agenda. List shows a 14-day agenda without the extra date heading/week strip. Desktop navigation/calendar and all records, handlers and routes are preserved.
- **Touch and text:** target at least 44×44 CSS px for primary mobile actions, icon buttons, navigation, selectors and checkbox label hit areas; preserve desktop density with responsive overrides. Checklist icons can remain visually small if their associated labels create the large activation area. Form text should remain at least 16px on mobile. Do not shrink the global type scale to fit controls.
- **Long content:** add `min-w-0` to the relevant flex/grid children; wrap names, rank/belt text, emails, generated credentials and user-entered notes. Keep essential information readable without a hover tooltip, HTML `title`, or drag gesture. Truncation is acceptable only with a readily tappable full-detail view.
- **Overlays:** reuse Shadcn-style `Dialog`, `Drawer`, `DropdownMenu` and `Popover` wrappers with Base UI focus/keyboard behavior. The requested mobile calendar details Drawer uses the already-installed Base UI drawer primitive; no new dependency is needed. Use `dvh`-aware height limits and safe-area spacing, and verify the on-screen keyboard separately. A generic dialog scroll cap must not introduce a second scroller inside a complex dialog that already owns its body scrolling.
- **State:** mobile/desktop layouts consume the same records and handlers. Do not mount two editable rosters/forms/scanners, duplicate element IDs, or lose draft/signature/camera state on resize. A small reactive breakpoint helper is acceptable only where mutually exclusive interactive renderers require it; presentation should otherwise use Tailwind.
- **Accessibility:** keep semantic links/buttons, visible focus rings, labels, status announcements, selected states, Escape handling and focus return. All actionable information must be available on tap/focus. Preserve reduced-motion handling and browser zoom.
- **Safe areas:** validate existing `env(safe-area-inset-*)` behavior. Add `viewport-fit=cover` to `index.html` only if adopting edge-to-edge presentation, and then validate header, kiosk, chat and dialog insets together. Do not disable zoom or add a maximum-scale restriction.

## 4. Implementation phases and dependencies

### Dependency map

```text
Phase 1: shared layouts, navigation, responsive UI contract
  ├─ Phase 2: instructor calendar + check-in/kiosk
  ├─ Phase 3: instructor students, reports, grading + account settings
  └─ Phase 4: public/auth/student pages + shared account markup
       └─ Phase 5: administrator page + instructor creation
Phases 1–5 ──> Phase 6: integrated testing and polish
```

- Phases 2 and 3 can be implemented independently after Phase 1. Their integration boundary is the unchanged `studentDetailsHref`, `assessmentHref`, `calendarHref` and selected-session query contract.
- Phase 2 owns calendar/check-in page internals and roster controls. Phase 3 consumes their links; it should not redesign calendar components.
- Phase 4 owns later changes to shared `Dashboard` and `AccountFields`; Phase 5 follows it. If work overlaps, finish and communicate that shared markup before integrating the administrator form.
- Phase 1 owns shared primitives. Later phases should prefer consumer-level responsive classes and report a shared defect before changing a primitive used by other phases.
- Each phase includes its own viewport/workflow verification. Phase 6 is the cross-route integration pass, not the first time mobile behavior is checked.

### Phase 1 — Shared layouts, navigation and responsive foundations

**Depends on:** none. **Deliverable:** all route shells and shared overlay/control conventions fit mobile widths, ready for page-specific work.

**Affected files**

- `src/layouts/RootLayout.tsx`
- `src/layouts/InstructorLayout.tsx`
- `src/layouts/AuthLayout.tsx`
- `src/components/instructor/InstructorNavigation.tsx`
- `src/components/MobileNavigation.tsx`, `src/components/student/StudentNavigation.tsx`, `src/components/ui/sheet.tsx` — shared mobile website navigation
- `src/components/auth/AuthGate.tsx` — presentation only
- `src/components/theme-toggle.tsx`
- `src/components/FloatingChatbot.tsx`
- Shared UI wrappers as needed: `src/components/ui/{button,input,password-input,textarea,tabs,dialog,popover,dropdown-menu,toast,avatar,tooltip,card,alert}.tsx`
- `src/index.css` — only narrowly needed shared responsive/safe-area rules; preserve theme/type tokens and kiosk chatbot hiding
- `index.html` — conditional viewport safe-area adjustment only
- `src/App.tsx` — route inventory/reference; preserve its route structure and global chatbot mounting

**Tasks**

- [ ] **1.1 Capture the desktop and mobile baseline.** Record existing page widths/header geometry at 1024/1280/1440px, then inspect representative routes at 320/390/768px. Include unauthenticated, authenticated and loading/error shells. Keep screenshots/notes available for later phase comparisons.
- [x] **1.2 Replace narrow mobile percentage containers.** Update Root main/error/fallback and ordinary instructor main widths to the shared gutter contract, restoring the original desktop percentages. Align instructor navigation with the intended page content. Keep existing calendar/station max-widths. Reduce excessive mobile vertical padding without changing desktop spacing.
- [x] **1.3 Cover the bypassed instructor shell.** Inspect `AuthLayout` and gate/not-found presentation under `/instructor/signin`, `/instructor`, protected-route loading/errors and unknown `/instructor/*` paths. Supply page-level gutters and short-screen spacing exactly once. Keep the instructor Root branch and all redirects/authorization behavior intact.
- [x] **1.4 Reflow Root navigation.** Use a sticky mobile brand/Menu navbar and left-side Sheet for role-based links, account information and theme controls. Preserve signed-out Sign in/Sign up, signed-in Dashboard/Sign out, pending/error handling, accessible focus return and the existing inline desktop header.
- [x] **1.5 Stabilize instructor navigation.** Use the same mobile website navbar/Sheet for Calendar, Students, Check-in and Profile, with 44px or larger targets. Preserve dashboard/assessment/report/student-detail active states, profile highlighting and the remembered `calendarTo` query; retain the existing desktop navigation.
- [x] **1.6 Establish page-versus-workspace heights.** Make non-kiosk calendar pages use natural document flow below `lg`; retain bounded desktop calendar workspace behavior. Keep check-in's mode-specific behavior and avoid a global height/overflow override that breaks kiosk. Coordinate page internals in Phase 2 before treating calendar scrolling as complete.
- [x] **1.7 Set mobile control sizing deliberately.** Give shared form inputs/password reveal controls appropriate mobile heights and text sizes. Define mobile action/tab/icon sizing via focused classes or an opt-in variant; restore existing desktop sizes. Audit consumer `h-10`/`size-7` overrides in subsequent phases rather than assuming a changed Button default will fix them. Ensure password input text cannot collide with Show/Hide.
- [ ] **1.8 Bound shared overlays.** Provide viewport-safe dialog/popover/dropdown widths and short-screen height limits, wrapping labels and touch-sized menu items. Preserve dialog footer stacking and focus APIs. Distinguish simple scrollable dialogs from complex dialogs with a fixed header/footer and one scrollable body. Verify collision positioning near each screen edge; bound tooltip width for long supplemental text.
- [ ] **1.9 Resolve fixed-widget clearance.** Preserve the chatbot's existing viewport sizing, safe-area offset, message wrapping, hidden-panel `inert` behavior and focus return. Reserve enough mobile page-end clearance that its launcher cannot cover the last action. Place toasts with safe-area spacing and a deliberate offset from the launcher; verify long toast content and dismiss targets. Modal overlays must remain above chat, and kiosk must still hide it.
- [ ] **1.10 Check shared content primitives.** Confirm card/alert children can shrink and wrap without clipping focus rings. Preserve noninteractive grade/selection badges and avatars; interactive instructor popovers need a comfortable tap target and viewport-capped content. Avoid blanket spacing/overflow changes to all cards.

**Phase 1 task audit:**

- **1.1 outstanding:** No baseline screenshots or recorded geometry for the requested viewport/authentication matrix were found in the project.
- **1.2 implemented:** `RootLayout.tsx` and `InstructorLayout.tsx` use mobile gutters and restore the original desktop percentage widths and workspace maximum widths.
- **1.3 implemented:** `AuthLayout.tsx`, `AuthGate.tsx`, and `NotFound.tsx` supply instructor-bypass gutters; `App.tsx` retains the routing and guards. Runtime fit is tracked separately below.
- **1.4 implemented with the requested Sheet redesign:** `RootLayout.tsx` and `MobileNavigation.tsx` retain role/account actions and desktop links. Browser fixtures cover guest, student, instructor and administrator Sheet contents, active links, 16px padding, dismissal, focus return and desktop resize.
- **1.5 implemented with the requested Sheet redesign:** `InstructorNavigation.tsx` supplies the existing links/active-state rules to `MobileNavigation.tsx`; `InstructorLayout.tsx` retains the calendar query. The navbar remains visible while the document scrolls; the calendar view popover is a separate page control beside month/year.
- **1.6 implemented in the shell:** `InstructorLayout.tsx` switches calendar height/overflow at `lg` and retains separate kiosk/check-in behavior. Calendar internals and viewport testing are tracked in 2.2.
- **1.7 implemented as a shared contract:** `input.tsx`, `password-input.tsx`, `button.tsx`, and `tabs.tsx` provide mobile sizes or opt-in touch variants and desktop restoration; later consumer overrides still require their owning phases' audit.
- **1.8 outstanding:** `dialog.tsx`, `popover.tsx`, `dropdown-menu.tsx`, and `tooltip.tsx` provide bounds and wrapping, but collision positioning, focus return, and short-screen behavior have not been browser-verified. The grading dialog overrides the generic scroll container, so its single-body behavior also needs verification.
- **1.9 outstanding:** `FloatingChatbot.tsx`, `toast.tsx`, the layouts, and `index.css` implement inert/focus handling, offsets, clearance, and kiosk hiding; long notifications, actual overlap, keyboard behavior and end-of-page reachability have not been verified.
- **1.10 outstanding:** `avatar.tsx` has a mobile-sized popover trigger and `alert.tsx` wraps text, but `card.tsx` still uses `overflow-hidden`; card/alert shrinkage and focus-ring clipping have not been checked in a browser.

The application also has student navigation and additional student routes not reflected in the original inventory; `StudentNavigation.tsx` now uses a mobile hamburger menu.

**Acceptance criteria**

- [ ] At 320px and 390px, the public/account and instructor headers fit without horizontal document scrolling; all existing navigation destinations and theme/account actions work by touch and keyboard.
- [ ] Normal mobile page content uses the available width with consistent gutters; login aliases and auth error/loading states also fit when instructor navigation is absent.
- [ ] At 1024/1280/1440px, original desktop proportions, typography, header links and workspace behavior match the baseline except for documented defect corrections.
- [ ] Generic dialogs/menus fit a 320px-wide short viewport; close, menu selection and form actions remain reachable. Focus returns to the triggering control.
- [ ] Chat input/send/close and notifications remain usable with a keyboard open; closed chat has no focusable hidden controls; no end-of-page action is permanently obstructed by the launcher.
- [x] Build/type-check passes after shared changes. Record any page-specific failures for the owning phase.

**Phase 1 acceptance audit:** Firefox iframe emulation at 320/390/768px found no document overflow on login, signup, staff login, instructor signin, unknown instructor route or checkout success; signed-out menus opened. A temporary instructor fixture also showed no overflow on calendar/check-in pages at those widths. The five unchecked criteria still require, respectively: (1) touch/keyboard and authenticated navigation tests; (2) gate loading/error states; (3) pre-change desktop baseline comparisons; (4) short-screen overlay and focus-return testing; and (5) real keyboard/chat/toast and page-end clearance testing. `npm run build` passes; emulation does not establish the remaining device and interaction criteria.

### Phase 2 — Instructor calendar, attendance and check-in/kiosk

The requested calendar phase also owns check-in because it is the other viewport-constrained instructor workspace and shares the attendance workflow.

**Depends on:** Phase 1 container, navigation, height and dialog contracts.

**Affected files**

- `src/pages/Instructor/InstructorDashboard.tsx` — includes local `CalendarDays`, `CalendarMonth` and `EventCard` components
- `src/components/instructor/CalendarTimeline.tsx`
- `src/components/instructor/CalendarAvailability.tsx`
- `src/components/instructor/MobileInstructorCalendar.tsx`, `MobileCalendarTimeline.tsx` — mobile-only presentation; existing records and handlers remain in `InstructorDashboard.tsx`
- `src/components/ui/drawer.tsx` — Shadcn-style Base UI drawer wrapper for mobile class details
- `src/components/instructor/ClassSessionDetails.tsx`
- `src/components/instructor/SelectedClassIndicator.tsx` — verify marker remains visible; changes only if required
- `src/pages/Instructor/InstructorCheckIn.tsx`
- `src/components/instructor/CheckInScanner.tsx`
- Reference-only contracts: `src/lib/instructor-calendar.ts`, `src/lib/instructor-availability.ts`, `src/lib/instructor-check-in.ts`, `src/hooks/use-qr-camera.ts`, `src/layouts/InstructorLayout.tsx`

**Tasks: calendar and availability**

- [x] **2.1 Reflow the calendar toolbar.** Separate the sticky site navbar from a page-specific month/year header with a Day/Week/Month/List popover on its right. Options include icons and a selected-state marker. Week retains two-day behavior. Keep Today beside previous/next and information after Add Availability. Omit redundant selected-date headings in Day/Week/List and the week strip in List. Preserve desktop controls and shortcuts.
- [x] **2.2 Complete mobile calendar scroll ownership.** Use document flow for the mobile timeline and agendas without nested vertical scrollers. Keep the desktop list panes and timeline bounded. Verify portrait widths and 320–390px-tall landscape viewports.
- [x] **2.3 Improve mobile day selection.** Use a horizontally swipeable week strip with concise weekday/day text, full accessible date labels, today/selected markers and previous/next day buttons. Horizontal schedule swipes change days. Day shows the selected day; Multi-day shows it and the following day, including grading. Preserve the existing desktop weekly list's training filter.
- [x] **2.4 Add a compact mobile month.** Show a compact month grid with class/grading/availability indicators and the selected day's agenda below. Keep all dates selectable and remain in Month on selection. Expose an empty-day message. Retain the existing desktop month grid and date-to-Day behavior there.
- [x] **2.5 Adapt timeline width and selection.** Make the single-day and two-day timelines fit mobile width with consistent minute/pixel positioning, per-day overlap lanes, current-time marker, Today refocus and no document horizontal overflow. Use document scrolling for the mobile timeline while preserving the bounded seven-day desktop timeline.
- [ ] **2.6 Preserve touch availability entry.** Keep existing touch/keyboard slot-click behavior and manual Add Availability; dragging is not a prerequisite. Make mobile slot targets comfortable, accounting for the current 36px half-hour height if a presentation-specific row height is needed. Keep pixel/minute positioning internally consistent and do not change `availabilityError` or overlap rules. Verify scrolling the timeline does not accidentally add an availability range.
- [x] **2.7 Replace mobile stacked class details with a Drawer.** Below `lg`, use the requested Shadcn-style bottom Drawer with one body scroller and a reachable Done action. Reuse EventCard/attendance handlers and avoid duplicate editable trees. Retain the desktop 320px panel. Verify URL/legacy selection, close, Back, focus return and resizing preserve date/session/view and attendance.
- [x] **2.8 Redesign mobile roster rows.** Keep name, GradeBadge and icon-only Present/Absent/Report actions on one line, with 44px action targets. A name popover exposes full names/grades when truncated. Preserve attendance toggling, bulk marking, read-only past classes, report URLs, the single Drawer body scroller and existing desktop density.
- [ ] **2.9 Reflow availability dialog and legend.** Stack date/time fields at the narrowest widths if native date/time controls cannot fit the existing two-column grid. Keep save/delete and validation messages visible with the keyboard open. Reflow the calendar legend's `9.5rem` fixed label column into a narrow stacked layout. Keep popover height bounded and all class type descriptions readable by tap.

**Tasks: check-in and kiosk**

- [x] **2.10 Fit check-in header and session menu.** Wrap rather than truncate essential session/dojo/date/time metadata on mobile. Let Enter Kiosk Mode take its own full-width mobile row when needed. Bound long session-menu labels to the viewport; preserve selected session and recent-check-in count behavior.
- [ ] **2.11 Make scanner/settings height- and width-aware.** Revisit `min-h-112` and absolute status/error overlays for short screens. Ensure camera-off/start/starting/denied/disconnected states and retry controls are readable without overlap. Bound the settings popup and native camera select to the available scanner/viewport width, including long device names; preserve start/stop/switch controls and existing camera logic.
- [ ] **2.12 Simplify normal mobile recent history scrolling.** Below the two-column workspace boundary, allow the recent check-ins list to flow with the document rather than creating an unnecessary `max-h-64` scroll area. Retain the useful bounded list in the desktop workspace. Check long student names, grade badges and timestamps.
- [ ] **2.13 Protect kiosk controls and feedback.** Fit the camera-off/error screen, success/duplicate/invalid overlay, grade and progress footer on short portrait and landscape screens. Keep Exit Kiosk Mode visibly reachable above feedback, respecting top/right/bottom safe areas. Preserve the single mounted scanner/video stream during mode switches, focus return, scan lock and existing feedback timing. Keep the navigation and chatbot hidden only as currently intended in kiosk mode.

**Phase 2 task audit:**

- **2.1 implemented:** `MobileInstructorCalendar.tsx` supplies compact mobile controls. Browser tests cover all four views at 320/360/390/430px without document overflow.
- **2.2 implemented:** The mobile timeline and agendas have no nested vertical scroller. Browser checks cover portrait and Drawer layouts at 568×320 and 844×390; desktop panes remain unchanged.
- **2.3 implemented:** `MobileInstructorCalendar.tsx` provides native scroll-snap week paging, selected-day buttons and horizontal schedule swipe handling. Browser tests cover week paging and synthetic pointer day swipes; physical iPhone gestures still need device testing.
- **2.4 implemented:** Mobile Month uses a compact indicator grid and selected-date agenda. Browser tests verify all 42 November grid dates, selection staying in Month, and the updated selected-date heading. Desktop Month is unchanged.
- **2.5 implemented:** `MobileCalendarTimeline.tsx` uses the same 1.6px/minute scale for one or two columns, slots, overlaps and events; browser tests verify exact positioning, consecutive-day columns, second-day class/availability selection and mobile width. It uses the document scroller and retains the explicit Today action. Desktop `CalendarTimeline.tsx` is unchanged by this redesign.
- **2.6 outstanding device verification:** Tap-based creation/edit/delete and unchanged overlap errors pass browser tests; vertical touch scrolling without accidental entry and native keyboard behavior remain unverified on physical devices. Swipe movement/cancellation suppresses clicks in the mobile schedule.
- **2.7 implemented:** `drawer.tsx` and `InstructorDashboard.tsx` preserve one editable roster and the URL handlers. Browser tests cover legacy `class`, close, Back, focus return and mobile/desktop resize with attendance retained; the Drawer fits short landscapes.
- **2.8 implemented:** `ClassSessionDetails.tsx` uses a single-line mobile grid, compact badge, 44px icon action bar and tap-accessible full student identity. Browser tests verify alignment at 320/390/430px, full-name access, attendance/report behavior and read-only rules.
- **2.9 outstanding device verification:** `CalendarAvailability.tsx` stacks native time fields, and `MobileInstructorCalendar.tsx` provides a compact colour-key popover. Browser create/edit/delete and overlap-validation checks pass; native controls and action visibility with the mobile keyboard still need device verification.
- **2.10 implemented:** `InstructorCheckIn.tsx` wraps metadata, gives the session trigger automatic height and provides a full-width mobile kiosk action. Long session-menu fixture testing remains part of acceptance verification.
- **2.11 outstanding:** `CheckInScanner.tsx` now uses a viewport-positioned Base UI popover instead of a popup clipped by the scanner card; Firefox emulation showed it within the 320px viewport. Camera states, long device names and retry/switch behavior still require device verification.
- **2.12 outstanding:** `InstructorCheckIn.tsx` removes the mobile list scrollbox and retains desktop scrolling, but long-name, badge and timestamp fixtures have not been checked.
- **2.13 outstanding:** `InstructorCheckIn.tsx` retains one scanner and a higher-z-index kiosk exit; `CheckInScanner.tsx` adds scrollable feedback. Short-screen/safe-area fit, touch exit, focus return and stream preservation remain unverified on a device.

**Acceptance criteria**

- [ ] Both `/instructor/calendar` and `/instructor/dashboard` support Today, previous/next range, all date ranges, both applicable display modes, class selection and availability editing at 320/390/768px without document-level horizontal overflow.
- [x] Mobile Day/Multi-day views show readable event details and reachable day selection; the mobile month grid and selected-day agenda expose training, grading and availability entries without a nested day scroller.
- [x] Selecting a class opens a usable roster, all names/actions can be reached, attendance can be marked/cleared or marked in bulk, and past classes remain read-only. Notes open the same student/tab/context as before.
- [ ] A touch user can create, edit and delete availability without dragging; past/invalid/overlap errors remain unchanged and readable. Empty days and overlapping timeline events are usable.
- [x] Calendar detail open/close, URL deep links, legacy `class` selection, browser history, and mobile-to-desktop resizing retain correct date/session/view state with no duplicate IDs or double saves.
- [ ] Check-in camera states, settings, success/duplicate/invalid feedback and recent list work in normal and kiosk presentation. Kiosk exit works by touch even during feedback; entering/exiting does not remount the active scanner or drop its stream.
- [ ] Desktop seven-day grids/timeline, month layout, side panel, keyboard shortcuts and station split layout match the baseline; calendar/availability helper tests and build pass.

**Earlier Phase 2 acceptance audit:** Firefox iframe emulation with a temporary instructor fixture found no document overflow on week/month calendar and check-in at 320/390/768/1024/1280/1440px. At 320px it opened and closed a class roster, retained the date on close, switched to timeline, opened availability and scanner settings, and entered/exited kiosk without remounting the video element. The subsequent calendar-specific verification is recorded below; check-in camera/stream behavior still needs real-device verification.

**Mobile calendar redesign verification (supersedes the calendar portions of the earlier audit):**

- The new browser fixture in `tests/mobile-responsive/calendar.fixture.tsx` uses a deterministic local auth context and clock; it does not modify shipped authentication or backend data. Start `npm run dev -- --host 127.0.0.1` and `geckodriver --port 4444`, then run `node --test tests/mobile-responsive/calendar.test.mjs`. Optional `FSDP_BASE_URL`/`WEBDRIVER_URL` override the defaults.
- The 14 focused browser tests cover calendar overflow at 320/360/390/430px, sticky website navigation, the view popover beside month/year, guest/student/instructor/administrator Sheet links and account information, active state, focus/dismissal and desktop resize. They also check 16px main/dialog/Sheet/Drawer/popover insets, single-line roster alignment and 44px actions, timeline geometry, day paging, Today, attendance, availability, URL/history, full-name popovers and short-landscape Drawer bounds.
- [Spacing research and applied values](mobile-calendar-spacing.md) document the Apple HIG, web.dev and W3C references. Compact calendar navigation retains its existing small inter-button gaps with large hit areas; main and overlay content have 16px padding, agenda date groups are 24px apart, and Today refocuses below the sticky site navbar.
- Mobile timeline blocks reuse desktop `getEventStyle(...).card`; agenda accents and month indicators reuse its `dot` colours. The mobile legend uses the shared class badges/descriptions. Browser comparisons confirm matching desktop/mobile timeline backgrounds, text and borders for sampled classes, grading and availability in light and dark themes.
- Before/after desktop comparisons at 1024/1280/1440px for default week List, day Timeline and Month matched every sampled main-content element's class, rounded geometry, font size and overflow setting (362/160/355 elements per view). No desktop calendar renderer or toolbar was redesigned.
- This is browser emulation, not physical-device approval: real iOS/Android gestures, native date/time controls and virtual keyboards still require device verification. Existing check-in/camera acceptance items are unaffected.

### Phase 3 — Instructor student profiles, reports, grading and account settings

**Depends on:** Phase 1. Phase 2 completion is required for final calendar-to-profile round-trip verification, but not for implementing these pages.

**Affected files**

- `src/pages/Instructor/InstructorStudents.tsx`
- `src/pages/Instructor/InstructorStudentDetails.tsx` — includes `StudentInformation`, `NextGradingSummary`, `StudentGrading`, `TechniqueChecklist`, `ExaminerSignaturePad`, and the nested close confirmation
- `src/components/instructor/StudentSessionHistory.tsx`
- `src/pages/Instructor/InstructorStudentReports.tsx`
- `src/pages/Instructor/InstructorGradingAssessment.tsx`
- `src/pages/Instructor/InstructorProfile.tsx`
- `src/components/GradeBadge.tsx` and `src/components/ui/avatar.tsx` — only narrow-content usage defects that cannot be fixed at consumers; coordinate with Phase 1
- Reference-only: `src/lib/instructor-student-details.ts`, `src/lib/student-grades.ts`, `src/lib/instructor-calendar.ts`

**Tasks: directory, profile and reports**

- [ ] **3.1 Refine the existing directory layout.** Preserve its stacked mobile search/filter rows and card-list structure. Give search/filter controls adequate tap height, keep long selected rank/belt/dojo values accessible in the menu, and wrap student names/IDs/grading-system text instead of relying on truncated names. Check the `sm` three-filter row and `lg` combined toolbar against actual available width. Keep `q`, `rank`, `belt`, `dojo`, clear/reset and result counts unchanged.
- [ ] **3.2 Bring identity and important alerts before tabs.** Change the mobile ordering of the existing StudentInformation region so a student name, rank, membership, medical alerts and contact information are reachable before a long session/grading list. Keep the desktop 30/70 sidebar/tabs layout and existing conditional sticky behavior. If secondary contacts are made collapsible to reduce mobile height, use a labeled tap/keyboard disclosure and keep medical alerts immediately visible; avoid duplicated profile content and IDs.
- [ ] **3.3 Fit profile navigation and summaries.** Keep Back and previous/student-count/next controls in an intentional mobile arrangement. All three tabs must fit and have comfortable targets. Stack the narrowest two-column principal-dojo/membership and current/next-grade summaries when needed. Make reporting-period text, eligibility actual/required values, rank transitions, instructor identity, feedback and history wrap within cards. Preserve `session`/legacy `class`, `date`, and `tab` query context when navigating students.
- [ ] **3.4 Reflow session history and its editor.** Keep attendance/date-order filters labeled and usable on mobile. Stack title/attendance and report-heading/edit-action rows when side-by-side content does not fit. Enlarge the existing `h-6` edit report target; keep Add/Edit, textarea, Save and Cancel visible with the keyboard open. Preserve draft text through simple viewport changes and the existing report-save attribution/attendance behavior. Wrap long author names and unbroken feedback tokens.
- [ ] **3.5 Refine class report cards.** Preserve single-column mobile/two-column desktop behavior in `InstructorStudentReports`. Apply appropriate mobile heading/padding and long-token wrapping to current and historical feedback. Verify student links and Back to class without changing fallback example feedback or missing-report behavior.

**Tasks: grading and signatures**

- [ ] **3.6 Make New Grading a mobile-first working dialog.** Below `sm`, use near-full-width/height viewport-aware dimensions, reduced horizontal padding and safe-area clearance. Give header/footer only the space they need; keep one scrollable checklist/signature body with `min-h-0`. Restore the current desktop maximum width, spacing and hierarchy. Confirm names, current/next grades and examiner attribution fit without excessive fixed-header height.
- [ ] **3.7 Enlarge checklist interaction areas.** Make category expand/collapse controls and associated technique checkbox labels comfortable touch targets, allowing long technique labels/notes to wrap. Preserve multiple-open accordion behavior, completion counts/progress, target-grade filtering, automatic saves and eligibility calculations. Do not attach a second click handler that double-toggles a label-controlled checkbox.
- [ ] **3.8 Preserve the existing responsive signature implementation.** The canvas already uses normalized points, pointer capture, `ResizeObserver`, aspect-ratio preservation and `touch-none`. Verify finger/stylus signing, undo, clear, retry and status text at mobile sizes; only adjust pad height/spacing/control wrapping where needed. `touch-none` stays limited to the drawing area so the rest of the dialog can scroll. Resizing/rotation must preserve the signature shape, storage scope and attribution, without introducing a second signing tree.
- [ ] **3.9 Verify the nested close confirmation.** Keep the existing confirm-close workflow for Done, close icon, Escape and outside-dismiss requests. Both Keep editing and Confirm and close must be fully reachable on short screens, with correct focus return to the underlying grading control or original trigger. Ensure the confirmation is above the grading dialog and chatbot, and that the underlying body does not scroll while the modal stack is active.
- [ ] **3.10 Fit the standalone assessment form.** Stack current/target-rank summaries and pending/completed buttons on the narrowest screens; wrap Back to assessment class, profile and save actions. Keep notes and saved status readable with the keyboard open. Cover both assessment route shapes and invalid/missing assessment states. Preserve existing local saving and status semantics; do not alter assessment eligibility or persistence.

**Tasks: instructor's own account**

- [ ] **3.11 Polish photo and account cards.** Keep the current mobile single-column/desktop two-column structure; revisit the `md` split if the actual 70%-width desktop card cannot fit photo actions. Ensure long names/emails, upload/change/remove controls, busy state and feedback wrap. Preserve file restrictions, browser-local photo storage and profile/avatar updates.
- [ ] **3.12 Verify change-password and sign-out presentation.** Build on the already viewport-capped password dialog: fit requirement/matching text, Show/Hide, Cancel and Save Changes with a mobile keyboard. Keep pending dismissal restrictions, success feedback across auth-driven remounts, and sign-out errors visible. Presentation edits must leave the Supabase update/sign-out calls, validation and navigation-state feedback unchanged.

**Acceptance criteria**

- [ ] At 320/390/768px, users can search/filter/reset the directory, identify a student, open any detail tab and move between class students without horizontal page scrolling or hover-only information.
- [ ] Student identity and medical alerts precede the long mobile working content; contacts remain reachable, and desktop sidebar ordering/stickiness remains correct.
- [ ] Users can filter/sort history and add/edit/save/cancel reports with a touch keyboard; long feedback, names, badges and eligibility values neither clip nor overlap actions.
- [ ] New Grading supports expanding categories, toggling sign-offs, signing/undoing/clearing/retrying and finishing/continuing the review on a 320px-wide short screen. Only its intended body scrolls; footer and close confirmation remain reachable.
- [ ] Rotation/resizing preserves current tab, report draft, sign-offs and signature shape/state; browser-local saves remain isolated by their existing student/system/rank keys.
- [ ] Both assessment URLs, report URLs, student not-found states and calendar/profile round trips retain their existing parameters and behavior.
- [ ] Photo upload/remove, password success/error/pending states and sign-out remain usable; desktop cards/dialogs match the baseline. Student-grade/signature helper tests and build pass.

### Phase 4 — Public/authentication and student-facing pages

This phase includes shared authentication and public return/error screens because they use the same Root/Auth shells as the small student dashboard.

**Depends on:** Phase 1. **Deliverable to Phase 5:** stable responsive `Dashboard` and `AccountFields` markup.

**Affected files**

- `src/pages/Login.tsx`
- `src/pages/Signup.tsx`
- `src/pages/StudentDashboard.tsx` — thin wrapper; verify without expanding its scope
- `src/components/auth/Dashboard.tsx`
- `src/components/auth/AccountFields.tsx`
- `src/pages/CheckoutSuccess.tsx`
- `src/pages/CheckoutCancel.tsx`
- `src/pages/NotFound.tsx`
- Reference: `src/layouts/AuthLayout.tsx`, `src/layouts/RootLayout.tsx`, `src/components/auth/AuthGate.tsx`

**Tasks**

- [ ] **4.1 Fit every login entry point.** Verify `/login`, `/staff/login` and `/instructor/signin` as the actual shell variants they are. Use mobile card/title spacing that leaves useful form width at 320px and avoids excessive vertical centering on short screens. Keep full-width submit and student/staff/signup links reachable; preserve shared Login behavior and auth redirects.
- [ ] **4.2 Polish signup/shared fields.** Retain the base single-column first/last-name fields and only split where they fit. Verify long labels, password hint, Show/Hide and validation/error content. Keep input sizing consistent with Phase 1 and the same `AccountFields instructor` contract used by administrator creation. Preserve required/pattern/length/autocomplete behavior and empty-form reset handling.
- [ ] **4.3 Fit the shared dashboard account panel.** Apply mobile heading/welcome wrapping and `min-w-0`/long-token handling to account details. Keep the existing email/role definition list and desktop card maximum width. Test a long first name, long email and the longer Administrator dashboard title as shared-component fixtures. The student dashboard remains an account summary; no calendar/table work is needed here.
- [ ] **4.4 Polish checkout and not-found pages.** Scale mobile headings appropriately, wrap explanatory text, and give Back to home a usable touch area. Preserve destinations and informational copy/behavior. Verify standard `*` and unknown instructor-path rendering after Phase 1 shell work.
- [ ] **4.5 Verify complete keyboard/touch flows.** Check browser autofill, password reveal without submit, pending/disabled buttons, validation alerts, sign-in/sign-up role redirects and the student's header sign-out. Keep existing Supabase calls and error handling intact.

**Acceptance criteria**

- [ ] All authentication aliases, signup, `/dashboard`, checkout return pages and unknown routes fit 320/390/768px with readable headings, no page-level horizontal overflow and reachable links/actions.
- [ ] A mobile user can complete the existing student sign-up/sign-in/sign-out flow and switch to staff sign-in; email/password and submit remain reachable with the keyboard open.
- [ ] The shared account/field markup handles long names/emails and administrator-title fixtures, and its desktop widths/type/field grids match the baseline.
- [ ] Existing loading, validation, network-error and pending states remain visible and announced; build passes.

### Phase 5 — Administrator-facing account and instructor creation

**Depends on:** Phase 1 and Phase 4 shared account/field updates. The current administrator UI is one account panel plus one creation form, so this is intentionally smaller than the instructor phases.

**Affected files**

- `src/pages/AdminDashboard.tsx` — wrapper/composition verification
- `src/components/auth/CreateInstructorForm.tsx`
- Consume finalized `src/components/auth/Dashboard.tsx` and `src/components/auth/AccountFields.tsx`; coordinate shared changes with Phase 4
- Reference-only: `src/lib/instructors.ts`; preserve its request and response handling

**Tasks**

- [ ] **5.1 Fit administrator composition.** Check the longer dashboard heading, account summary and creation card within Root's mobile gutter width. Keep the two existing cards in natural document flow and retain their desktop `max-w-2xl` treatment.
- [ ] **5.2 Fit instructor creation fields and actions.** Reuse the finalized shared first/last-name/email fields. Give Create instructor/Creating instructor… a full-width mobile treatment if required and restore desktop sizing. Verify required fields, error messages, busy state and reset-on-success presentation without changing submit logic.
- [ ] **5.3 Make the success credential block readable.** Wrap the created email, generated password and staff-login guidance within the success alert; keep the full password visible/selectable, using the existing `break-all`/`select-all` code treatment. Ensure long email/password strings do not expand the alert grid. Keep account creation result and status announcement visible when the keyboard dismisses.
- [ ] **5.4 Verify role-specific navigation and state.** Check `/admin` Dashboard/Sign out menu and `/staff/login` return flow, creation failure/retry and successful result presentation with a development account or a browser-test mocked response. Preserve single-display credential behavior and do not add storage, copying workflows or backend changes.

**Acceptance criteria**

- [ ] At 320/390/768px, administrators can reach the account card, complete instructor creation, read errors and select the entire generated password without horizontal document scrolling or clipped content.
- [ ] Creation pending/success/error states fit with long names, emails and credential strings; resize does not erase an already displayed result or trigger a second request.
- [ ] Instructor creation still uses the existing API, reset and credential-display behavior; desktop composition and shared form appearance match the baseline. Build passes.

### Phase 6 — Integrated testing, regression checks and polish

**Depends on:** all preceding phases. Perform targeted verification in each phase first; this phase closes cross-route, device and breakpoint gaps.

**Affected files / artifacts**

- All files changed by Phases 1–5, with fixes scoped to the owning component
- Existing regression suites: `tests/instructor-calendar.test.mjs`, `tests/student-grades.test.mjs`
- `package.json` only if adding a focused browser-test command/dev dependency is justified by the new responsive interaction behavior
- Focused browser tests and their local calendar fixture now live under `tests/mobile-responsive/` using Node's test runner and Firefox/WebDriver; no Playwright configuration or additional npm dependency is required
- This document: check off verified criteria and record remaining defects/baseline evidence

**Tasks**

- [ ] **6.1 Run the route/state matrix below.** Include 320, 360, 390, 414, 640, 768, 1024, 1280 and 1440 CSS px. At 320 and a common modern-phone width, test both portrait and landscape; include short viewports such as 568×320 and 844×390. Check immediately below/above changed breakpoints, especially 639/640, 767/768 and 1023/1024px.
- [ ] **6.2 Check overflow and scroll ownership explicitly.** At each representative state, verify `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (allow only rounding tolerance). Inspect portaled overlays separately: document width alone does not reveal clipped fixed content. Scroll from first to last item/action. Confirm normal mobile pages use document scrolling, complex dialogs one body scroller, and timeline/chat only their intended bounded viewport. Do not hide defects with global overflow clipping.
- [ ] **6.3 Verify real touch/keyboard behavior.** Test iOS Safari and Android Chrome with browser chrome expansion/collapse, virtual keyboard, orientation changes and safe areas. Use localhost/HTTPS as required for camera testing. Emulation is useful for layout but insufficient for camera permission/stream, native date/time inputs, signature drawing and keyboard viewport behavior.
- [ ] **6.4 Check accessibility and non-hover operation.** Complete navigation, calendar selection, attendance, availability editing, report editing and grading dialogs using taps and keyboard/focus alone. Inspect focus order/rings, tab/accordion semantics, menu labels, live status announcements, nested modal focus return, reduced motion and light/dark contrast. Check browser zoom/text enlargement, including 200% text/zoom and desktop reflow toward a 320px CSS viewport.
- [ ] **6.5 Exercise long/empty/error fixtures.** Use long unbroken emails/feedback, multiword names, long dojo/camera labels, rank/belt variants, missing ranks, no results, no sessions, missing routes and API/storage/camera failures. Supply fixture data through browser-test mocks or existing state/storage boundaries, without changing application data helpers or backend contracts.
- [ ] **6.6 Add only meaningful responsive interaction automation.** Focused Firefox/WebDriver calendar checks now exist under `tests/mobile-responsive/`; there is no frontend test npm script. Extend browser-level coverage where needed for overflow/visibility and high-risk state transitions: grading confirmation/signature resize, navigation and keyboard-sized form actions. Reuse browser-test mocks for role/account/API boundaries and fake camera streams where useful; do not bypass guards in shipped application code. Keep real-device checks for hardware/native behaviors. Avoid snapshotting utility class strings or duplicating helper tests.
- [ ] **6.7 Run the existing relevant checks.** Run `npm run build` and `node --test tests/instructor-calendar.test.mjs tests/student-grades.test.mjs` on the supported Node version (README specifies Node 22.12+ or 24+; helpers use Node's TypeScript support). If browser tests were introduced, run their documented command. Backend/database/function changes are outside these phases and should not be required for UI verification.
- [ ] **6.8 Compare desktop baselines and finish integration.** Confirm no unnecessary desktop rearrangement, routing changes, duplicate interactive trees, lost state or clipped focus indicators. Resolve shared primitive regressions at their source with focused changes. Update completed tasks and any genuinely outstanding acceptance criteria with affected route, viewport and reproduction steps.

### Integrated route and workflow test matrix

| Area | Required states and actions |
| --- | --- |
| Shared shell and redirects | Guest and all three roles; header/account menu; theme; sign out pending/failure; lazy loading; missing profile/retry; `/` and `/instructor` redirects; correct role guards and preserved instructor search string |
| Authentication | All three login paths; signup; empty/filled/invalid/error/pending fields; reveal/hide password; keyboard open; autofill; form reset/reload; student/staff links |
| Calendar | Both dashboard/calendar aliases; day/week/month; List/Timeline; Today/previous/next; selected/unselected, empty day/month, grading events, overlapping events, current-time marker; mobile/desktop resize and browser Back |
| Calendar details and availability | Deep-linked `date`, `view`, `session` and legacy `class`; open/close roster; mark/clear present/absent and mark all; past read-only; note link; availability create/edit/delete; invalid/order/past/overlap errors; tap versus scroll; desktop keyboard shortcuts |
| Check-in | Session menu; camera off/starting/live/denied/unavailable/disconnected; long camera labels and camera switch/stop; valid `ASK:CHECKIN:<student-id>` fixture for an enrolled student, duplicate, invalid and wrong-session code; count/history; kiosk enter/exit during feedback; rotation and stream continuity |
| Student directory/detail | Search/rank/belt/dojo combinations, no result/reset; direct student detail versus class-linked detail; overview/sessions/grading tabs; previous/next boundaries; contact/medical/membership variants; session filter/sort; report add/edit/save/cancel and author text |
| Grading | Adult/children and terminal/missing-syllabus cases; eligibility, long technique labels/notes, accordion categories, sign-off progress and save failure; signature draw/undo/clear/resize/retry; close confirmation via Done/icon/Escape/outside request; keep editing/confirm and close |
| Reports/assessment | Report roster cards/current and previous feedback; valid and invalid report IDs; both assessment URL formats; pending/completed selection, notes/save status and back/profile links; invalid student/event/assessment |
| Instructor profile | Long identity text; photo absent/present/upload/remove/invalid/oversized/save error/pending; password requirements/mismatch/success/error/pending; on-screen keyboard; sign-out error |
| Student/administrator | Student email/role summary; administrator long title/account summary; instructor creation validation/pending/error/success; long selectable generated password and email; no duplicate request on resize |
| Public and global widgets | Checkout success/cancel; generic and instructor-prefixed 404; chatbot open/closed/send/long messages/typing/scroll/close/focus return; toast with long text, launcher clearance, modal layering and kiosk hiding |

### Final definition of done

- [ ] Every route and state in the inventory has been checked at the applicable mobile/tablet/desktop sizes, with failures resolved or explicitly recorded as incomplete.
- [ ] All existing workflows are operable from 320px upwards with readable content, comfortable touch targets and no hover-only controls. Navigation and availability editing do not require dragging; finger/stylus drawing remains supported for the existing signature workflow.
- [ ] No page-level horizontal scrolling, clipped essential content, unreachable dialog actions, unnecessary nested mobile scrolling or fixed-widget obstruction remains.
- [ ] Desktop visual/functionality baselines, role navigation, data/API contracts and existing persistence semantics are preserved.
- [ ] Production build, relevant existing regression tests and any newly justified browser tests pass; device-only checks have recorded results.
- [ ] Changes remain limited to responsive presentation and necessary frontend interaction handling; no backend, Supabase integration or schema changes are included.

## 5. Handoff checklist for each implementation phase

- [ ] Read the shared contract, dependency map and the phase's affected files before editing; confirm predecessor deliverables are available.
- [ ] Implement only that phase's tasks, retaining existing handlers/data contracts and coordinating shared primitive ownership.
- [ ] Verify phase acceptance criteria at 320px, a common phone width, tablet and the affected desktop breakpoints; capture useful before/after evidence.
- [ ] Run the applicable build/regression checks, and report any environment-blocked verification with the exact route/state/check still outstanding.
- [ ] Update this plan's checkboxes only after the corresponding implementation and verification are complete. Summarize touched files, state-preservation decisions and dependencies for the next phase.
