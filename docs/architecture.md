# Architecture: instructor platform

## Layers and data flow

- `src/main.tsx` mounts auth and `src/App.tsx`; role guards wrap routes and `src/layouts/InstructorLayout.tsx` injects the shared instructor API.
- Instructor pages/components → React state and `src/hooks/use-instructor-data.ts` / mutation hooks → `src/lib/instructor/` API and view helpers → `src/lib/supabase.ts` → Supabase Auth, tables or Postgres RPCs/RLS. This is not uniformly hook-mediated: some page actions call the API directly.
- Edge Functions are separate workflows, not the instructor read layer: guest checkout, grading checkout, Stripe webhook, instructor provisioning and grading invitations live in `supabase/functions/`.
- Opening a class: `src/pages/Instructor/InstructorDashboard.tsx` selects an event UUID in the URL; `useInstructorQuery` loads `loadCalendarRange` from `src/lib/instructor/calendar-queries.ts`, which calls `getCalendar` in `src/lib/instructor/api.ts` → `instructor_calendar` RPC. `src/components/instructor/ClassSessionDetails.tsx` → `src/hooks/use-instructor-attendance.ts` → `src/lib/instructor/attendance.ts` → `getEvent`/`getRoster` → assigned event and roster tables. Attendance saves use `save_instructor_attendance` RPC, then reload the roster.
- State: component state and URL search params; instructor queries have account/resource keys, abort, retry and stale-result isolation, not a shared query cache. The student directory loads an account-scoped page-local snapshot and filters locally (`src/lib/instructor/directory.ts`). No query library or central query-key registry is configured in `package.json`.

## Directory map

| Path | Contents |
| --- | --- |
| `src/pages/Instructor/` | Instructor route pages; dashboard and calendar share a page |
| `src/components/instructor/` | Instructor calendar, roster, profile-detail, grading and scanner UI |
| `src/components/ui/` | Shared shadcn/base-ui primitives |
| `src/hooks/` | Auth, instructor query/write and camera hooks |
| `src/lib/instructor/` | Typed API, decoders, identity adapters, domain reads/writes and projections |
| `src/lib/` | Auth, shared Supabase client, legacy instructor helpers and student helpers |
| `src/pages/admin/`, `src/components/admin/`, `src/lib/admin/` | Separate administrator UI and mostly mock data |
| `src/pages/Student/`, `src/components/student/` | Student UI; some student pages also live directly in `src/pages/` |
| `supabase/migrations/` | Schema, policies, triggers and RPCs |
| `supabase/functions/` | Edge Function handlers, entry points, shared helpers and Deno tests |
| `tests/` | Node/offline database and API tests; `tests/mobile-responsive/` contains browser fixtures and instructions |
| `scripts/` | Admin and instructor-calendar development seed scripts |

## Where to look for X

| Feature | Exact starting points |
| --- | --- |
| Routes, guards, roles | `src/App.tsx`, `src/components/auth/AuthGate.tsx`, `src/components/auth/AuthProvider.tsx`, `src/lib/auth.ts` |
| Instructor navigation and kiosk shell | `src/layouts/InstructorLayout.tsx`, `src/components/instructor/InstructorNavigation.tsx` |
| Calendar, mobile views, dates | `src/pages/Instructor/InstructorDashboard.tsx`, `src/components/instructor/MobileInstructorCalendar.tsx`, `src/components/instructor/CalendarTimeline.tsx`, `src/components/instructor/MobileCalendarTimeline.tsx`, `src/lib/instructor/calendar-view.ts`, `src/lib/instructor-calendar.ts` |
| Class selection, roster, attendance | `src/components/instructor/ClassSessionDetails.tsx`, `src/hooks/use-instructor-attendance.ts`, `src/lib/instructor/attendance.ts`, `supabase/migrations/20261105160000_instructor_attendance.sql` |
| Availability | `src/components/instructor/CalendarAvailability.tsx`, `src/components/instructor/InstructorAvailabilityEditor.tsx`, `src/hooks/use-instructor-availability-save.ts`, `supabase/migrations/20261108074638_part_time_instructor_availability.sql` |
| Student directory, filters, track | `src/pages/Instructor/InstructorStudents.tsx`, `src/lib/instructor/directory.ts` |
| Student detail, contacts, history | `src/pages/Instructor/InstructorStudentDetails.tsx`, `src/components/instructor/StudentSessionHistory.tsx`, `src/lib/instructor/student-detail.ts` |
| Grade badge, eligibility, syllabus | `src/components/instructor/DatabaseGradeBadge.tsx`, `src/components/instructor/StudentGradingRead.tsx`, `src/lib/instructor/grading.ts` |
| Reports and assessment | `src/pages/Instructor/InstructorStudentReports.tsx`, `src/pages/Instructor/InstructorGradingAssessment.tsx`, `src/components/instructor/ReportEditor.tsx`, `src/lib/instructor/session-reads.ts`, `src/hooks/use-instructor-session-save.ts`, `src/lib/instructor/session-writes.ts` |
| QR check-in / kiosk | `src/pages/Instructor/InstructorCheckIn.tsx`, `src/components/instructor/CheckInScanner.tsx`, `src/hooks/use-qr-camera.ts`, `src/lib/instructor-check-in.ts` |
| Instructor profile, photo, password | `src/pages/Instructor/InstructorProfile.tsx`, `src/components/ui/avatar.tsx`, `src/lib/instructor-calendar.ts` |
| API, types, decoding, errors | `src/lib/instructor/api.ts`, `src/lib/instructor/types.ts`, `src/lib/instructor/decoders.ts`, `src/lib/instructor/adapters.ts`, `src/lib/instructor/errors.ts` |
| Request keys / loading | `src/hooks/use-instructor-data.ts` and the calling page; `src/components/instructor/InstructorDataStatus.tsx`, `src/components/instructor/InstructorLoadingBoundary.tsx` |
| Database shape and instructor contracts | [Database schema](database-schema.md); [instructor data contracts](instructor-data.md); `supabase/migrations/` for actual SQL |
| Env, deploy, test setup | `.env.example`, `vite.config.ts`, `README.md`, `package.json`, `tests/mobile-responsive/README.md` |
| Instructor chatbot | `src/components/FloatingChatbot.tsx`, `src/lib/instructor/chat.ts`, `supabase/functions/instructor-chat/` — caller-scoped read tools and OpenRouter; see README for secrets/deployment |

## Key patterns

**Instructor service/API operation**
1. Extend `src/lib/instructor/api.ts` and `src/lib/instructor/types.ts`; use the injected client, not a second auth client.
2. Validate IDs and responses in `src/lib/instructor/adapters.ts` / `src/lib/instructor/decoders.ts`; distinguish missing data, errors and cancellation.
3. For multi-page reads, follow the complete-page checks in `src/lib/instructor/calendar-queries.ts`; add API/offline DB tests in `tests/`.
4. For database changes, add a migration in `supabase/migrations/` and enforce authorization server-side; see `docs/instructor-data.md`.

**Hook**
1. Model reads on `src/hooks/use-instructor-data.ts`: stable `useCallback` loader, resource key, abort signal and retry.
2. Model saves on `src/hooks/use-instructor-attendance.ts` or `src/hooks/use-instructor-session-save.ts`: account isolation, pending/error and authoritative reload; retain retry identity where applicable.

**Edge Function**
1. Follow `supabase/functions/create-instructor/index.ts` and `supabase/functions/create-instructor/handler.ts`: thin `Deno.serve` entry, testable handler.
2. Match the workflow's authentication: role/JWT, Stripe signature, or intentionally public checkout; do not assume the gateway verifies JWTs (`supabase/config.toml`).
3. Add a Deno test in `supabase/functions/tests/`, register checks in `package.json`, and deploy separately as described in `README.md`.

**Page**
1. Add a page under `src/pages/Instructor/`, lazy route under the existing instructor guard/layout in `src/App.tsx`.
2. Reuse `src/components/instructor/` and `src/components/ui/`; wire the API context/query hook and explicit loading/error/empty states.
3. Add navigation in `src/components/instructor/InstructorNavigation.tsx` if needed; add affected Node/browser tests (`tests/mobile-responsive/README.md`).

## Domain notes

- A dojo is a centre; grading is a rank assessment, not automatically a promotion. Children/adult are grade tracks; the directory uses adult in the calendar year the student turns 13 (`src/lib/instructor/directory.ts`). Grade order, colours and track membership come from reference data, not hard-coded badge names (`src/lib/instructor/grading.ts`).
- Readiness means ready to start assessment: active membership, at least three months' membership, applicable age/time/session minimums and no outstanding fees. Technique completion is separate; a missing prerequisite can be unverified (`src/lib/instructor/grading.ts`).
- Cycle attendance counts present/late from last grading or joining; rate excludes excused/unmarked. Summary includes ended, non-cancelled classes across dojos (`docs/instructor-data.md`). See [database schema](database-schema.md) for tables and constraints.

## Known quirks and gotchas

- Auth user ID and instructor-domain ID are distinct. Instructors can read all students even without a linked instructor row; personal calendar/roster and writes have narrower ownership rules (`docs/instructor-data.md`).
- Instructor time projections use Singapore time; date-only gradings have no invented start/end (`src/lib/instructor/calendar-view.ts`).
- Attendance, reports and assessments save through RPCs with snapshots/retry receipts. Availability create/edit/delete persist for linked part-time instructors; edits and confirmed deletions use opening snapshots and exact-request retries, and conflict reload keeps the draft. Technique sign-off writes are not wired (`docs/instructor-data.md`). QR check-in uses fixture sessions and local state (`src/pages/Instructor/InstructorCheckIn.tsx`); profile photos are browser-local (`src/pages/Instructor/InstructorProfile.tsx`).
- Admin is mostly in-memory mock data, but account creation, grading invitations and notification reads are live (`src/pages/admin/Instructors.tsx`, `src/pages/admin/GradingEligibility.tsx`, `src/pages/admin/Notifications.tsx`).
- Instructor directory navbar overflow at 1024px with enlarged text is recorded in `docs/instructor-data.md`; responsive tests need Firefox and geckodriver (`tests/mobile-responsive/README.md`).
- Only `VITE_` env variables reach the browser; keep secrets server-side. Vercel deploys frontend separately from Supabase migrations/functions (`README.md`, `.vercelignore`).

## Open questions

- Should technique sign-offs persist across assessment attempts, or be scoped per attempt? The current table has no assessment-event reference (`docs/instructor-data.md`).
- Which remaining instructor mutation checkpoints are approved for implementation? The roadmap in `docs/instructor-data.md` calls for separate approval.
