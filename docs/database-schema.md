# Database tables

Columns only — no rows or seed data. Types and defaults match the live database.

## Identity and access

### `users`

Application-level profile for every authenticated account. Mirrors the core fields of `auth.users` and stores the role used for routing and row-level security.

| Column       | Type          | Nullable | Default     |
| ------------ | ------------- | -------- | ----------- |
| `id`         | `uuid`        | no       | —           |
| `first_name` | `text`        | no       | `''`        |
| `last_name`  | `text`        | no       | `''`        |
| `email`      | `text`        | no       | —           |
| `role`       | `user_role`   | no       | `'student'` |
| `phone`      | `text`        | yes      | —           |
| `created_at` | `timestamptz` | no       | `now()`     |
| `updated_at` | `timestamptz` | no       | `now()`     |

## People and membership

### `students`

Member record for a dojo student. Optionally linked to an auth user, with home centre, current grade, membership status and follow-up/fee flags.

| Column              | Type                | Nullable | Default             |
| ------------------- | ------------------- | -------- | ------------------- |
| `id`                | `uuid`              | no       | `gen_random_uuid()` |
| `user_id`           | `uuid`              | yes      | —                   |
| `member_no`         | `text`              | no       | —                   |
| `first_name`        | `text`              | no       | —                   |
| `last_name`         | `text`              | no       | —                   |
| `email`             | `text`              | no       | —                   |
| `phone`             | `text`              | yes      | —                   |
| `home_centre_id`    | `uuid`              | no       | —                   |
| `date_of_birth`     | `date`              | no       | —                   |
| `current_grade_id`  | `text`              | no       | `'unranked'`        |
| `membership_status` | `membership_status` | no       | `'active'`          |
| `joined_at`         | `date`              | no       | —                   |
| `last_graded_at`    | `date`              | yes      | —                   |
| `follow_up_status`  | `follow_up_status`  | no       | `'none'`            |
| `outstanding_fees`  | `boolean`           | no       | `false`             |
| `created_at`        | `timestamptz`       | no       | `now()`             |
| `updated_at`        | `timestamptz`       | no       | `now()`             |

### `instructors`

Instructor record. Optionally linked to an auth user and used as the owner of classes, events and technique sign-offs.

| Column       | Type          | Nullable | Default             |
| ------------ | ------------- | -------- | ------------------- |
| `id`         | `uuid`        | no       | `gen_random_uuid()` |
| `user_id`    | `uuid`        | yes      | —                   |
| `first_name` | `text`        | no       | —                   |
| `last_name`  | `text`        | no       | —                   |
| `email`      | `text`        | no       | —                   |
| `created_at` | `timestamptz` | no       | `now()`             |
| `profile_picture_url` | `text` | yes | — |
| `employment_type` | `text` | yes | — |
| `instructor_title` | `text` | no | `'none'` |
| `is_examiner` | `boolean` | no | `false` |

Provisioning: `20261104130000_instructor_availability.sql` creates a linked instructor row when a trusted `users` profile is inserted or assigned the `instructor` role. The existing administrator `create-instructor` function already uses that trusted Auth role path. Availability now requires an existing linked instructor explicitly marked `part_time`; it no longer creates an unclassified instructor on first save. No row is claimed by matching an email or display name.

`employment_type` is constrained to `part_time` / `full_time`; null is unspecified. Instructors cannot edit it. `updated_at` and the instructor-specific timestamp trigger were removed in `20261108062206_instructor_profile_fields.sql`.

`instructor_title` is the required Aikikai title: `none` / `fukushidoin` / `shidoin` / `shihan` (CHECK `instructors_instructor_title_check`, `not null`, default `none`). It is stored separately from `grade_id`, but the grade limits which title is allowed: Fuku-shidōin needs 2nd dan or above, Shidōin 4th dan or above, Shihan 6th dan or above. Kyu grades, Junior Dan and 1st Dan allow only `none`. The dan is read from the grade id (`2nd-dan`), never from the belt colour, because 2nd and 1st Kyu also wear black. These rules live in `allowedTitles()` in `supabase/functions/_shared/instructor-titles.ts`, which both the Create Instructor form and the `create-instructor` Edge Function use. The function returns 400 for a missing or unranked grade, a missing title, or a disallowed grade/title pair. Only administrators can write the column, through the existing "Admins manage instructors" policy, and instructors cannot edit it themselves. The database checks only the title value, not the grade/title pair, so a direct admin write can bypass the grade rules. Provisioning reads trusted `app_metadata.instructor_title` and falls back to `none`; an unknown value rolls back the auth-user creation (`20261111100917_instructor_titles.sql`, `20261111120948_required_instructor_title.sql`). `5th-dan` and `6th-dan` (`20261111120934_instructor_dan_grades.sql`) are instructor-only grades: they have no `grade_tracks`, requirements or syllabus rows, so student grading ladders never offer them. 6th Dan is the minimum for Shihan. `grade_id` stays nullable until the existing instructors without a grade are assigned one. The migration lists them in a notice; after that, add `not null` in a follow-up migration.

New photos are uploaded to the private `instructor-photos` Storage bucket as `<auth-user-id>/<random-uuid>.jpg`. `profile_picture_url` stores that object path, not an expiring signed URL. The UI converts JPG/PNG/WebP device files (up to 5 MB) to a 512px JPEG and generates one-hour signed URLs on reads. Authenticated users may view photos; only linked instructors may upload/delete files in their own folder. Photo updates go through the account-fenced `save_instructor_profile_photo` RPC, which checks the uploaded object and rejects a stale previous path. Employment and identity fields remain protected.

`is_examiner` marks instructors who can sit on grading panels. Administrators set it, either on Create Instructor (through trusted `app_metadata.instructor_is_examiner`) or with the toggle on the admin Instructors page. It does not depend on grade or title. The flag cannot be removed while the instructor sits on the panel of a grading whose event is still `scheduled` (`PGP03`).

### `grading_panel_members`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `grading_event_id` | `uuid` | no | — |
| `instructor_id` | `uuid` | no | — |
| `is_chief` | `boolean` | no | `false` |
| `added_at` | `timestamptz` | no | `now()` |

The examiners assigned to one grading event. The primary key is (`grading_event_id`, `instructor_id`), and a partial unique index allows at most one chief examiner per grading. Members must have `is_examiner = true` (`PGP02`). Rows cascade when the grading or the instructor is deleted.

Administrators and linked instructors can read panels; students and anonymous users cannot. Only administrators can write them. The admin UI replaces a whole panel with `set_grading_panel(target_event, examiner_ids, chief_id)`, which runs as the caller under RLS, so it is limited to administrators.

**Who can grade:** the trigger function `enforce_grading_panel()` requires the acting instructor to be on the grading's panel (`PGP01`). It runs before every insert or update on `grading_batches` and `instructor_grading_reviews` (`instructor_id`), and on `technique_sign_offs` (`signed_off_by`) when the row has an `event_id`. Class-time sign-offs have no `event_id` and are not affected. Because the check is on the tables, every grading RPC is covered without changing it. Removing an examiner from a panel also locks their unsubmitted drafts.

**Backfill** (`20261111123748_grading_panels.sql`): each existing grading's assessing instructor (`events.instructor_id`) became its chief examiner. Anyone who had already graded it (batches, reviews or sign-offs) became a member. Everyone backfilled was flagged as an examiner.

### `instructor_private_details`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `instructor_id` | `uuid` | no | — |
| `address` | `text` | yes | — |

One optional row per instructor; the primary key references `instructors(id)` with cascading deletion. RLS permits administrators to manage all rows and linked instructors to read only their own. Self-service address changes use `save_instructor_address(expected_user, new_address)`, not direct table writes. The RPC verifies the current account/role/link, trims input, limits it to 1,000 characters, and treats blank input as null. Students and other instructors cannot read the address.

### `emergency_contacts`

Emergency contact entries belonging to a student. One contact can be marked primary.

| Column         | Type      | Nullable | Default             |
| -------------- | --------- | -------- | ------------------- |
| `id`           | `uuid`    | no       | `gen_random_uuid()` |
| `student_id`   | `uuid`    | no       | —                   |
| `name`         | `text`    | no       | —                   |
| `relationship` | `text`    | no       | —                   |
| `phone`        | `text`    | no       | —                   |
| `is_primary`   | `boolean` | no       | `false`             |

### `student_medical_alerts`

Medical conditions or alerts staff must see for a student. Old entries are retained with `active = false`.

| Column        | Type          | Nullable | Default             |
| ------------- | ------------- | -------- | ------------------- |
| `id`          | `uuid`        | no       | `gen_random_uuid()` |
| `student_id`  | `uuid`        | no       | —                   |
| `description` | `text`        | no       | —                   |
| `active`      | `boolean`     | no       | `true`              |
| `recorded_at` | `timestamptz` | no       | `now()`             |

## Reference data

### `centres`

Dojo branch that hosts classes and events.

| Column       | Type            | Nullable | Default             |
| ------------ | --------------- | -------- | ------------------- |
| `id`         | `uuid`          | no       | `gen_random_uuid()` |
| `name`       | `text`          | no       | —                   |
| `short_name` | `text`          | no       | —                   |
| `address`    | `text`          | no       | `''`                |
| `timezone`   | `text`          | no       | `'Asia/Singapore'`  |
| `status`     | `centre_status` | no       | `'active'`          |
| `capacity`   | `smallint`      | yes      | —                   |
| `created_at` | `timestamptz`   | no       | `now()`             |
| `updated_at` | `timestamptz`   | no       | `now()`             |

### `class_types`

Catalogue of regular class kinds, such as weapons or kids classes.

| Column        | Type   | Nullable | Default |
| ------------- | ------ | -------- | ------- |
| `id`          | `text` | no       | —       |
| `label`       | `text` | no       | —       |
| `description` | `text` | no       | `''`    |

### `grades`

Every belt and rank in the unified ladder, including `Unranked`.

| Column       | Type       | Nullable | Default |
| ------------ | ---------- | -------- | ------- |
| `id`         | `text`     | no       | —       |
| `label`      | `text`     | no       | —       |
| `colour`     | `text`     | yes      | —       |
| `is_ranked`  | `boolean`  | no       | `true`  |
| `sort_order` | `smallint` | no       | —       |

### `grade_tracks`

Which ladder a grade belongs to. A grade can appear on the children and/or adult track.

| Column     | Type          | Nullable | Default |
| ---------- | ------------- | -------- | ------- |
| `grade_id` | `text`        | no       | —       |
| `track`    | `grade_track` | no       | —       |

### `grade_requirements`

Published time, session and age minimums for a grade on a track.

| Column          | Type          | Nullable | Default |
| --------------- | ------------- | -------- | ------- |
| `grade_id`      | `text`        | no       | —       |
| `track`         | `grade_track` | no       | —       |
| `min_months`    | `smallint`    | no       | `0`     |
| `max_months`    | `smallint`    | yes      | —       |
| `min_sessions`  | `smallint`    | yes      | —       |
| `min_age_years` | `smallint`    | yes      | —       |

### `syllabus_items`

One sign-off-able syllabus requirement for a grade on a track. The `id` is stable (`track/grade/category/item`) and is what technique sign-offs reference.

| Column       | Type          | Nullable | Default |
| ------------ | ------------- | -------- | ------- |
| `id`         | `text`        | no       | —       |
| `grade_id`   | `text`        | no       | —       |
| `track`      | `grade_track` | no       | —       |
| `category`   | `text`        | no       | —       |
| `sort_order` | `smallint`    | no       | —       |
| `label`      | `text`        | no       | —       |
| `note`       | `text`        | yes      | —       |

## Calendar and events

### `events`

Shared header for everything on the calendar. The subtype tables (`classes`, `seminars`, `workshops`, `gradings`) reuse this primary key.

| Column          | Type           | Nullable | Default             |
| --------------- | -------------- | -------- | ------------------- |
| `id`            | `uuid`         | no       | `gen_random_uuid()` |
| `event_type`    | `event_type`   | no       | —                   |
| `centre_id`     | `uuid`         | no       | —                   |
| `instructor_id` | `uuid`         | yes      | —                   |
| `name`          | `text`         | no       | —                   |
| `starts_at`     | `timestamptz`  | yes      | —                   |
| `ends_at`       | `timestamptz`  | yes      | —                   |
| `status`        | `event_status` | no       | `'scheduled'`       |
| `created_at`    | `timestamptz`  | no       | `now()`             |
| `updated_at`    | `timestamptz`  | no       | `now()`             |

The fetched `20261104055444_official_grading_schedule.sql` migration permits date-only grading events. `starts_at` and `ends_at` must both be present or both be null; non-grading events still require both timestamps. A null grading time is unpublished, not midnight.

### `classes`

Class-specific fields for an event.

| Column          | Type   | Nullable | Default |
| --------------- | ------ | -------- | ------- |
| `event_id`      | `uuid` | no       | —       |
| `class_type_id` | `text` | no       | —       |

### `seminars`

Seminar-specific fields for an event, including an optional external location.

| Column              | Type   | Nullable | Default |
| ------------------- | ------ | -------- | ------- |
| `event_id`          | `uuid` | no       | —       |
| `external_location` | `text` | yes      | —       |

### `workshops`

Workshop-specific fields for an event.

| Column        | Type   | Nullable | Default |
| ------------- | ------ | -------- | ------- |
| `event_id`    | `uuid` | no       | —       |
| `description` | `text` | yes      | —       |

### `gradings`

Grading-window fields for an event: track, application deadline and window status.

| Column                 | Type                    | Nullable | Default   |
| ---------------------- | ----------------------- | -------- | --------- |
| `event_id`             | `uuid`                  | no       | —         |
| `track`                | `grade_track`           | yes      | —         |
| `application_deadline` | `date`                  | yes      | —         |
| `application_status`   | `grading_window_status` | no       | `'draft'` |
| `grading_date`         | `date`                  | yes      | —         |
| `application_opens_on` | `date`                  | yes      | —         |
| `reporting_release_on` | `date`                  | yes      | —         |
| `reporting_time`       | `time`                  | yes      | —         |
| `official_schedule`    | `boolean`               | no       | `false`   |

`20261112150000_grading_scheduler.sql` adds `is_private boolean not null default false` (private gradings are scheduled by hand; the scheduler refuses them) and `schedule_published_at timestamptz` (null while the day's schedule is a draft). Until publishing, only administrators and the chief examiner see the sessions, examiners cannot start checklists, and students do not get the reporting time.

For official schedules, grading/open/close/reporting-release dates are required, opening must not follow closing, closing precedes grading, and reporting release must not follow grading. Source: `20261104055444_official_grading_schedule.sql:10–22`.

### `grading_target_grades`

Grades being examined at a grading event.

| Column             | Type   | Nullable | Default |
| ------------------ | ------ | -------- | ------- |
| `grading_event_id` | `uuid` | no       | —       |
| `grade_id`         | `text` | no       | —       |

### `event_students`

Roster and per-student state for an event: attendance, check-in, instructor report and assessment.

| Column              | Type                | Nullable | Default |
| ------------------- | ------------------- | -------- | ------- |
| `event_id`          | `uuid`              | no       | —       |
| `student_id`        | `uuid`              | no       | —       |
| `attendance_status` | `attendance_status` | yes      | —       |
| `recorded_at`       | `timestamptz`       | yes      | —       |
| `report`            | `text`              | yes      | —       |
| `report_author_id`  | `uuid`              | yes      | —       |
| `assessment_status` | `assessment_status` | yes      | —       |
| `assessment_notes`  | `text`              | yes      | —       |
| `checked_in_at`     | `timestamptz`       | yes      | —       |
| `candidate_number`  | `integer`, positive | yes      | assigned for grading rosters |

`candidate_number` is unique within an event and assigned by a server-side trigger.
Existing grading rosters are numbered deterministically by student UUID; new
participants receive the next number under an event-row lock. Numbers are not
recomputed when the UI is sorted or filtered.

### `instructor_attendance_requests`

Private idempotency receipts added by
`20261105160000_instructor_attendance.sql`. Browser/anonymous table privileges
are revoked and RLS has no browser policies. The attendance RPC derives the
actor, checks current role/event ownership and returns an exact matching receipt
on retry; receipts cannot be used to bypass demotion or event reassignment.

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `request_id` | `uuid` (PK) | no | — |
| `user_id` | `uuid` → `users.id` | no | — |
| `event_id` | `uuid` → `events.id` | no | — |
| `payload` | `jsonb` | no | — |
| `response` | `jsonb` | no | — |
| `created_at` | `timestamptz` | no | `now()` |

User/event deletion cascades to their receipts. Payload/response contain only
attendance/request metadata, without report text or assessment notes. The RPC
updates only `event_students.attendance_status`; arrival/recording timestamps and
report/assessment fields are retained. Direct instructor REST insert/update/delete
paths cannot create, alter, remove or re-key recorded attendance; trusted server
and administrator operations retain their existing behavior.

### `instructor_session_write_requests`

Private report/assessment retry receipts added by
`20261105170000_instructor_session_saves.sql`. RLS is enabled, with browser/
anonymous table privileges revoked. The RPC checks the actual account/role,
linked instructor, assigned event and enrolment before saves or exact receipt
replays. There is no client-supplied author assignment.

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `request_id` | `uuid` (PK) | no | — |
| `user_id` | `uuid` → `users.id` | no | — |
| `event_id` | `uuid` → `events.id` | no | — |
| `student_id` | `uuid` → `students.id` | no | — |
| `kind` | `text`, report or assessment | no | — |
| `payload` | `jsonb` | no | — |
| `response` | `jsonb` | no | — |
| `created_at` | `timestamptz` | no | `now()` |

User/event/student deletion cascades to their receipts. Payloads/responses contain
the action's report/author or assessment status/note snapshots, without copying
unrelated row fields. Existing `event_students` columns/enums are unchanged.
The save RPC updates only its action's fields and guards direct instructor REST
bypasses; original author and attendance guards remain independently enforced.

## Grading

### Instructor grading batches

Migration: `20261108152249_instructor_grading_batches.sql` (applied to Supabase).
Resume/edit support: `20261108154345_resume_editable_grading_batches.sql`.

Each instructor has one independent batch per `(event_id, instructor_id, track,
target_grade_id)`. The only states are `draft` and `submitted`. No final grade,
student promotion, legacy assessment-status update or technique sign-off is
produced by saving/submitting a batch.

| Table | Columns |
| --- | --- |
| `grading_batches` | `id uuid` PK, `event_id uuid` FK to gradings, `instructor_id uuid` FK, `track grade_track`, `target_grade_id text`, `status text` default draft, `version integer` default 1, `signature jsonb` nullable, `submitted_at timestamptz` nullable, `created_at timestamptz`, `updated_at timestamptz` |
| `grading_batch_students` | `batch_id uuid`, `event_id uuid`, `student_id uuid`, `candidate_number integer`, `name text` snapshot, `notes text` nullable; PK `(batch_id, student_id)` |
| `grading_batch_items` | `batch_id uuid`, `syllabus_item_id text`, `category text` snapshot, `label text` snapshot, `sort_order integer`; PK `(batch_id, syllabus_item_id)` |
| `grading_batch_results` | `batch_id uuid`, `student_id uuid`, `syllabus_item_id text`, `checked boolean`; PK across the first three columns |
| `grading_batch_write_requests` | `request_id uuid` PK, `instructor_id uuid`, `batch_id uuid`, `payload jsonb`, `response jsonb`, `created_at timestamptz` |

Composite foreign keys keep every result inside its batch's participant and
technique sets. Batch participants must belong to the event roster. Snapshot
rows preserve the names, candidate numbers and technique labels that were signed.

All five tables have RLS. Owners and administrators may read batches and their
contents; other instructors cannot read each other's drafts/submissions. No
browser direct writes are granted. Retry receipts intentionally have no browser
policies or grants. Authenticated RPCs derive/check the actual linked instructor;
`grading_batch_document` is internal and not browser-executable.

- `get_instructor_grading_batch(event, track, grade)` returns the caller's batch or null.
- `get_latest_instructor_grading_batch(event)` returns the caller's most recently
  updated draft or submission for the session, restoring its track, target grade
  and matrix automatically. Other instructors' batches are never considered.
- `save_instructor_grading_batch(request_id, expected_user, event, track, grade,
  expected_version, cells, submit, examiner_signature)` saves a complete matrix
  atomically. Version 0 means first creation. Exact retries return the original
  receipt; stale versions, changed matrices and reused request IDs are rejected.
- Submission requires a bounded, normalized signature. Both drafts and submitted
  batches remain editable by their owner through the version-checked save RPC.
  Saving edits as a draft clears the current signature and submission timestamp;
  resubmitting requires a fresh signature. Prior signed matrices and signatures
  remain immutable in the private request receipts. There is no voiding or
  final-decision operation in this phase.
- The grading page shows the server's `updated_at` as "Last saved" for drafts or
  `submitted_at` as "Last submitted" for submissions, below the table in Singapore time.

### `grading_applications`

A student's application to a grading event for a target grade.

The student portal records a confirmed (currently simulated) card payment with
`record_grading_payment(p_grading_event_id, p_target_grade_id)`. The RPC resolves
the signed-in student and, when IDs are omitted, their next eligible grading
opportunity, then inserts the application as `submitted` (the enum has no `paid`
value). Production payment confirmation should come from the Stripe webhook.

The grading checkout now calculates the displayed base fee by target grade using
`src/lib/grading-fees.ts`, transcribed from the user-supplied ASK grading SOP.
It adds S$22 after the application's closing day ends in Singapore. The current
official grading page confirms a late administrative charge but does not publish
the SOP amounts or payment methods. Card, PayNow and bank transfer are explicitly
simulated UI methods; no recipient details/QR are fabricated. The receipt's fee
breakdown/method are not persisted as verified payment data. Direct `/grading`
fee previews do not call the application-write RPC; only an application carrying
an event ID can save, with the existing server eligibility checks unchanged.
Late pricing does not bypass those checks or automatically reopen an event.
The separate legacy Stripe checkout still uses its fixed SGD 60 test price and
must be migrated to authoritative per-grade pricing before any live use.

| Column             | Type                 | Nullable | Default             |
| ------------------ | -------------------- | -------- | ------------------- |
| `id`               | `uuid`               | no       | `gen_random_uuid()` |
| `student_id`       | `uuid`               | no       | —                   |
| `grading_event_id` | `uuid`               | no       | —                   |
| `target_grade_id`  | `text`               | no       | —                   |
| `submitted_at`     | `timestamptz`        | no       | `now()`             |
| `status`           | `application_status` | no       | `'submitted'`       |
| `notes`            | `text`               | yes      | —                   |

### Grading-day scheduler

Migration: `20261112150000_grading_scheduler.sql`.

`grading_schedule_rules`: one row per `grade_track` (PK `track`). Columns: `default_capacity` (used only when the centre has no `capacity`), `min_session_size`, `default_session_minutes`, `day_start`, `day_end` (latest finish), `lunch_start`, `lunch_end`, `changeover_minutes`, `updated_at`.

`grading_session_durations`: `id`, `track`, `from_grade_id` (nullable = any current grade), `to_grade_id`, `minutes`; unique per `(track, from, to)`. An exact transition wins over "any", and anything unlisted uses the track default. The adult rows are seeded as placeholders (75 / 90 / 120).

Both tables are administrator-only under RLS.

`sort_grading_sessions(event)` generates a draft:
1. Group non-withdrawn applications by current grade → target grade.
2. Split groups over capacity evenly.
3. Merge groups below the minimum size into an adjacent group of a neighbouring grade, if both sessions are the same length and the combined group fits the capacity.
4. Order lowest grade first.
5. Place sessions back to back from `day_start`, never across lunch, with a changeover between sessions. Sessions that run past `day_end` are still placed and reported as a warning.

The edit RPCs are `move_grading_candidate`, `split_grading_session`, `merge_grading_sessions` and `add_grading_session`. Each one re-times the day and turns the schedule back into a draft. `publish_grading_schedule` / `unpublish_grading_schedule` toggle publication; publishing needs every applicant placed and no empty sessions. `examiner_grading_day` adds `is_private`, `published_at`, `capacity`, `warnings` (administrators and the chief only) and, for each session, `transitions` with their lengths.

### `technique_sign_offs`

Instructor sign-off that a student has demonstrated one syllabus item.

| Column             | Type          | Nullable | Default             |
| ------------------ | ------------- | -------- | ------------------- |
| `id`               | `uuid`        | no       | `gen_random_uuid()` |
| `student_id`       | `uuid`        | no       | —                   |
| `syllabus_item_id` | `text`        | no       | —                   |
| `signed_off_at`    | `timestamptz` | no       | `now()`             |
| `signed_off_by`    | `uuid`        | yes      | —                   |
| `note`             | `text`        | yes      | —                   |

## Notifications

### `grading_email_sends`

Grading invitation send attempts, optionally associated with a grading event or campaign. This definition follows the live table DDL supplied by the project owner.

| Column             | Type          | Nullable | Default             |
| ------------------ | ------------- | -------- | ------------------- |
| `id`               | `uuid`        | no       | `gen_random_uuid()` |
| `grading_event_id` | `uuid`        | yes      | —                   |
| `status`           | `text`        | no       | `'pending'`         |
| `recipient_count` | `integer`     | no       | —                   |
| `created_at`       | `timestamptz` | no       | `now()`             |
| `completed_at`     | `timestamptz` | yes      | —                   |
| `error`            | `text`        | yes      | —                   |
| `event_name`       | `text`        | yes      | —                   |
| `campaign_key`     | `text`        | yes      | —                   |

Constraints and relationships from the supplied DDL:

- `id` is the primary key.
- `grading_event_id` references `gradings.event_id` with `ON DELETE SET NULL`.
- `status` permits `pending`, `accepted`, or `failed`; this is a text check constraint, not a PostgreSQL enum.
- `recipient_count` must be non-negative.
- `grading_email_one_accepted_or_pending` allows only one pending/accepted send per non-null `grading_event_id`.
- `grading_email_one_all_campaign` allows only one pending/accepted send per non-null `campaign_key`.

Migration history: `20261103185301_grading_checkout.sql:60–73` defines the initial table. The fetched `20261104055444_official_grading_schedule.sql:24–31` adds `event_name`, makes the event reference nullable, and sets `ON DELETE SET NULL`. `20261104094458_grading_invitation_wording.sql:43–47` adds `campaign_key` and its index. Together these match the project owner's supplied DDL above.

### `grading_invitation_settings`

Administrator-managed invitation subject and body. The boolean primary key/check permits a single settings row with `id = true`.

| Column       | Type          | Nullable | Default |
| ------------ | ------------- | -------- | ------- |
| `id`         | `boolean`     | no       | `true`  |
| `subject`    | `text`        | no       | —       |
| `body`       | `text`        | no       | —       |
| `updated_at` | `timestamptz` | no       | `now()` |

Defined by `20261104094458_grading_invitation_wording.sql`. The fetched track-date/link migrations update the body constraints: required child/adult grading and application-close placeholders, no obsolete generic placeholders, and one literal application link. See `20261104115311_grading_invitation_track_dates.sql:25–34` and `20261104153902_grading_invitation_literal_link.sql:20–24`.

### `notifications`

An email notification batch, with recipient and delivery counters.

| Column            | Type                    | Nullable | Default             |
| ----------------- | ----------------------- | -------- | ------------------- |
| `id`              | `uuid`                  | no       | `gen_random_uuid()` |
| `template`        | `notification_template` | no       | —                   |
| `subject`         | `text`                  | no       | —                   |
| `audience_label`  | `text`                  | no       | —                   |
| `recipient_count` | `integer`               | no       | `0`                 |
| `created_at`      | `timestamptz`           | no       | `now()`             |
| `sent_at`         | `timestamptz`           | yes      | —                   |
| `delivered_count` | `integer`               | no       | `0`                 |
| `failed_count`    | `integer`               | no       | `0`                 |

### `notification_recipients`

Per-recipient delivery state for a notification.

| Column                | Type                           | Nullable | Default             |
| --------------------- | ------------------------------ | -------- | ------------------- |
| `id`                  | `uuid`                         | no       | `gen_random_uuid()` |
| `notification_id`     | `uuid`                         | no       | —                   |
| `student_id`          | `uuid`                         | yes      | —                   |
| `email`               | `text`                         | no       | —                   |
| `status`              | `notification_delivery_status` | no       | `'pending'`         |
| `error`               | `text`                         | yes      | —                   |
| `provider_message_id` | `text`                         | yes      | —                   |
| `updated_at`          | `timestamptz`                  | no       | `now()`             |

## Operations

### `instructor_availability`

Instructor availability windows used for scheduling.

| Column          | Type   | Nullable | Default             |
| --------------- | ------ | -------- | ------------------- |
| `id`            | `uuid` | no       | `gen_random_uuid()` |
| `instructor_id` | `uuid` | no       | —                   |
| `date`          | `date` | no       | —                   |
| `start_time`    | `time` | no       | —                   |
| `end_time`      | `time` | no       | —                   |

Only instructors whose `employment_type` is explicitly `part_time` can read their own availability or create slots. Full-time, unspecified, unlinked and non-instructor accounts have no instructor availability access. Administrators retain management access. `current_part_time_instructor_id()` supplies the current permission check used by RLS and the calendar; hidden controls are not the security boundary.

The `create_instructor_availability(expected_user, slot_date, slot_start, slot_end)` RPC derives ownership from the authenticated, linked part-time instructor account. `expected_user` is an account-switch check, not a caller-selected owner. Instructor writes enforce future times between 08:00 and 22:00 Singapore time, non-overlap with existing availability, and non-overlap with non-cancelled assigned events. Exact create retries return the existing slot only while employment access remains valid. The existing edit/delete RPC also checks current employment before returning a receipt, and a write trigger guards security-definer writes. Existing slots are retained if an instructor's employment changes, but become inaccessible to that instructor.

The calendar now connects edits and confirmed deletions to `save_instructor_availability(request_id, expected_user, target_slot, write_kind, expected_record, new_value)`. The opening date/time snapshot is kept separate from refreshed query data, including database seconds. Lost responses retry the same request ID and payload. Conflicts offer a caller-scoped reload that updates the snapshot without discarding the draft. All cached availability/calendar ranges for the current account are invalidated after write attempts; old-account completions cannot affect a later login.

## Instructor read access

`supabase/migrations/20261104120000_instructor_reads.sql` adds instructor read contracts without changing the tables or enums above:

- The original migration provides cross-instructor/dojo history through teaching relationships. `20261105130000_instructor_all_students.sql` supersedes that read scope with all-student access based on `users.role = 'instructor'`, including accounts without an instructor-domain link.
- Role-aware instructor identity and a report-author ownership trigger for instructor writes.
- RLS enabled on `grade_requirements`, completing its previously defined policies.
- Explicit authenticated SELECT grants for the instructor data tables, still subject to their RLS policies.
- Read RPCs: `instructor_student_directory`, `instructor_student_history`, `instructor_student_summary`, and `instructor_event_reports`.

See [Instructor data contracts](instructor-data.md) for pagination, aggregate definitions, authorization, verification, and deployment details. The migration must be applied to the target database for these contracts to be available.

The fetched reset migration does not contain `grade_requirements` policies. `20261105120000_instructor_reference_policies.sql` explicitly adds authenticated SELECT and administrator-only management policies where absent. This completes the RLS protection enabled by the instructor read migration without changing table columns or inserting reference data.

`20261105130000_instructor_all_students.sql` adds instructor SELECT policies for `students`, `emergency_contacts`, `student_medical_alerts`, `event_students`, `grading_applications` and `technique_sign_offs`, and updates directory/history/summary RPC role checks. Its read helpers do not require teaching assignments or `instructors.user_id` linkage. Existing write policies and report-author ownership remain separate; no table columns are changed.

## Enums referenced above

| Enum                           | Values                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `application_status`           | `submitted`, `under_review`, `withdrawn`                       |
| `assessment_status`            | `pending`, `completed`                                         |
| `attendance_status`            | `present`, `late`, `absent`, `excused`                         |
| `centre_status`                | `active`, `closed`, `under_renovation`                         |
| `event_status`                 | `scheduled`, `completed`, `cancelled`                          |
| `event_type`                   | `class`, `seminar`, `workshop`, `grading`                      |
| `follow_up_status`             | `none`, `flagged`, `contacted`, `resolved`                     |
| `grade_track`                  | `children`, `adult`                                            |
| `grading_window_status`        | `draft`, `open`, `closed`                                      |
| `membership_status`            | `active`, `expired`, `pending`                                 |
| `notification_delivery_status` | `pending`, `sent`, `delivered`, `failed`, `bounced`            |
| `notification_template`        | `grading_invitation`, `attendance_concern`, `general_reminder` |
| `user_role`                    | `administrator`, `instructor`, `student`                       |
