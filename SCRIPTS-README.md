# Scripts

## Create a test class (`seed:class`)

Creates one class at a chosen time, with existing students enrolled and a set class size.

**Setup:** the root `.env` needs `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

```bash
npm run seed:class -- --datetime "2026-11-25T18:00" --students 3 --capacity 8
npm run seed:class -- --help   # list all flags
```

The `--` is required.

| Flag | Default | Description |
|---|---|---|
| `--datetime` | **required** | Start time. No offset means Singapore time (+08:00). |
| `--students` | **required** | Number to enrol, 1–3. Not needed with `--remove`. |
| `--capacity` | `20` | Class size. Must be at least `--students`. |
| `--duration` | `60` | Minutes. |
| `--instructor` | none | Instructor login email. |
| `--centre` | first active | Centre `short_name`. |
| `--class-type` | `adults` | `class_types.id`, e.g. `weapons`. |
| `--remove` | | Delete the class at `--datetime`. |

**Students:** none are created or deleted. `--students N` enrols the first N of
`jamie.lim@`, `avery.tan@`, `riley.ong@` (all `example.test`). Edit
`TEST_STUDENT_EMAILS` in the script to change them.

**Notes:**
- The class is named after its class type, e.g. "Adults".
- Enrolments are inserted directly, so no credits are charged and capacity isn't checked.
- Re-running with the same `--datetime` updates the same class, with no duplicate.
- To test a full class or the waitlist, set `--students` equal to `--capacity`.

**Remove:**

```bash
npm run seed:class -- --datetime "2026-11-25T18:00" --remove
```

**Tests:** `node --test tests/create-test-class.test.mjs`

## Create a test grading (`seed:grading`)

Creates one adult grading with a default panel and applicants. Same setup as `seed:class`.

```bash
npm run seed:grading -- --datetime "2026-11-28T10:00" --students 3
npm run seed:grading -- --help
```

| Flag | Default | Description |
|---|---|---|
| `--datetime` | **required** | Start time. No offset means Singapore time. |
| `--students` | **required** | Applicants, 1–3. Not needed with `--remove`. |
| `--duration` | `180` | Minutes. |
| `--centre` | headquarters | Centre `short_name`. |
| `--remove` | | Delete the grading at `--datetime`. |

**Panel:** chief examiner `ethan.chua@example.test`, examiner `nadia.wong@example.test`.
Both must be examiners with an instructor login.

**Applicants:** the same existing students as `seed:class`, with a submitted application for
their next adult grade. There is no `--capacity`, since gradings don't store one.

Re-running with the same `--datetime` updates the same grading. To remove it:

```bash
npm run seed:grading -- --datetime "2026-11-28T10:00" --remove
```

**Tests:** `node --test tests/create-test-grading.test.mjs`

## Add credits (`seed:credits`)

Adds class credits to a student account. Same setup as `seed:class`.

```bash
npm run seed:credits -- --student jamie.lim@example.test --amount 10
npm run seed:credits -- --help
```

| Flag | Default | Description |
|---|---|---|
| `--student` | **required** | Student email. The student must have a login. |
| `--amount` | **required** | Credits to add, 1–1000. |
| `--expires` | never | Expiry date, `YYYY-MM-DD`. |

Each run adds a new batch, so repeating it adds more credits. There is no remove flag.
It prints the new balance. No payment or Stripe receipt is created.

**Tests:** `node --test tests/add-credits.test.mjs`

## Give a membership (`seed:membership`)

Activates a student's membership without Stripe. Same setup as `seed:class`.

```bash
npm run seed:membership -- --student jamie.lim@example.test
npm run seed:membership -- --student jamie.lim@example.test --rank yellow-10th-kyu --months 6
npm run seed:membership -- --help
```

| Flag | Default | Description |
|---|---|---|
| `--student` | **required** | Student email. The student must have a login. |
| `--rank` | keep current | A `grades.id`, e.g. `unranked`, `yellow-10th-kyu`. |
| `--months` | `12` | Months added to the expiry, 1–120. |

It runs the same `finalize_membership_fee` function as the Stripe webhook, with a fake session id.
The student becomes active, the expiry moves forward, and a paid dummy "Membership fee (test)"
payment (120 SGD) shows in their history. Missing phone and emergency contact get dummy values.
Real data is never overwritten. Running it again extends the expiry again.

**Tests:** `node --test tests/add-membership.test.mjs`

## Create an account (`seed:account`)

Creates a student, instructor or administrator login. Same setup as `seed:class`.

```bash
npm run seed:account -- --username sam
npm run seed:account -- --username coach --role instructor --examiner --full-time
npm run seed:account -- --help
```

| Flag | Default | Description |
|---|---|---|
| `--username` | **required** | Login email. A bare name becomes `<name>@example.test`. |
| `--password` | `TestPass123` | 8–128 characters with a letter and a number. |
| `--role` | `student` | `student`, `instructor` or `administrator`. |
| `--name` | username | `"First Last"`. |

Instructor-only flags (all optional):

| Flag | Description |
|---|---|
| `--examiner` | May sit on grading panels. |
| `--chief-examiner` | Same as `--examiner`. Chief is set per grading in the admin panel. |
| `--part-time` / `--full-time` | Employment type. Default: unspecified. |

A student also gets a `pending` student record (dummy date of birth, first active centre).
Run `seed:membership` to activate it. It fails if the email is already registered.

**Tests:** `node --test tests/create-account.test.mjs`

## Class availability (`seed:availability`)

Marks an instructor's class unavailable (a cover request), or available again. Same setup as `seed:class`.

```bash
npm run seed:availability -- --datetime "2026-11-25T18:00" --instructor coach@example.test --class-type adults
npm run seed:availability -- --datetime "2026-11-25T18:00" --instructor coach@example.test --class-type adults --available
```

| Flag | Description |
|---|---|
| `--datetime` | **required.** Class start, to the minute. No offset means Singapore time. |
| `--instructor` | **required.** Email of the assigned instructor. |
| `--class-type` | **required.** `class_types.id`, e.g. `adults`. |
| `--available` | Toggle back: cancels the request. |

Unavailable creates the same request as the instructor's button, so the admin calendar shows it.
No admin email is sent. The class must be scheduled and in the future. A class another instructor
already covers can't be changed. Repeating a command is safe.

**Tests:** `node --test tests/set-class-availability.test.mjs`
