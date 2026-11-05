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
| `updated_at` | `timestamptz` | no       | `now()`             |

Provisioning: `20261104130000_instructor_availability.sql` creates a linked instructor row when a trusted `users` profile is inserted or assigned the `instructor` role. The existing administrator `create-instructor` function already uses that trusted Auth role path. Legacy unlinked accounts are linked on their first successful availability save. No row is claimed by matching an email or display name.

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

## Grading

### `grading_applications`

A student's application to a grading event for a target grade.

| Column             | Type                 | Nullable | Default             |
| ------------------ | -------------------- | -------- | ------------------- |
| `id`               | `uuid`               | no       | `gen_random_uuid()` |
| `student_id`       | `uuid`               | no       | —                   |
| `grading_event_id` | `uuid`               | no       | —                   |
| `target_grade_id`  | `text`               | no       | —                   |
| `submitted_at`     | `timestamptz`        | no       | `now()`             |
| `status`           | `application_status` | no       | `'submitted'`       |
| `notes`            | `text`               | yes      | —                   |

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

The `create_instructor_availability(expected_user, slot_date, slot_start, slot_end)` RPC derives ownership from the authenticated instructor account. It creates a missing linked instructor row and the availability in one transaction. `expected_user` is an account-switch check, not a caller-selected owner. Instructor writes enforce future times between 08:00 and 22:00 Singapore time, non-overlap with existing availability, and non-overlap with non-cancelled assigned events. Exact create retries return the existing slot. See `supabase/migrations/20261104130000_instructor_availability.sql`.

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
