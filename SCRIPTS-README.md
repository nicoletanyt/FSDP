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
